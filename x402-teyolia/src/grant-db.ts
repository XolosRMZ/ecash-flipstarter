// DB del grant x402 (PR-3; INF-042 §8.2; INF-045 §5.3 RQ-04; nota E-6).
// Archivo propio, distinto del store de facturas. Tabla `x402_access_grant` con UNIQUE en
// invoice_hash, settled_txid y nonce; inserción `ON CONFLICT DO NOTHING` genérica y lectura por
// cada clave en UNA transacción local (BEGIN IMMEDIATE). Cualquier divergencia o error de
// restricción no absorbido -> 409 EFFECT_BINDING_CONFLICT, nunca 500 (T-04, T-08).
// Sin efectos fuera de la transacción: no hay contadores, ledger ni notificaciones (§8.2 paso 4).
// Este módulo no monta middleware ni ruta (eso es PR-4): recibe el contexto de liquidación ya
// verificado (`request.x402Settlement`) como dato inyectado.

import { DatabaseSync } from 'node:sqlite';

/** Subconjunto de `request.x402Settlement` (SettlementVerificationSuccess) que usa el grant. */
export interface SettlementContext {
  readonly ok?: true;
  readonly invoice: {
    readonly invoiceHash: string;
    readonly nonce: string;
    readonly resourceHash: string;
    readonly amountSats: bigint;
    readonly payTo: string;
    readonly state: string;
    readonly settledTxid?: string | undefined;
  };
}

/** Fuente inyectada de facturas PAID para la conciliación (T-03). Ver decisión abierta D-2. */
export interface PaidInvoiceSource {
  listPaid(): Iterable<{ readonly invoiceHash: string; readonly settledTxid: string; readonly settledAt: number }>;
}

export type GrantOutcome =
  | { readonly ok: true; readonly status: 'GRANTED' | 'EFFECT_REPLAYED'; readonly grantId: string }
  | { readonly ok: false; readonly httpStatus: 409 | 500; readonly code: 'EFFECT_BINDING_CONFLICT' | 'RECONCILIATION_REQUIRED' | 'X402_CONTEXT_MISSING' };

interface GrantRow {
  grant_id: string;
  invoice_hash: string;
  settled_txid: string;
  nonce: string;
  resource_hash: string;
  amount_sats: string;
  pay_to: string;
}

export interface GrantDbOptions {
  /** Reloj inyectado (segundos Unix). */
  readonly now?: () => number;
  /** Generador de grant_id inyectado (por defecto crypto.randomUUID). */
  readonly newId?: () => string;
}

/**
 * Reintento acotado del cambio a WAL (Codex #65). `PRAGMA journal_mode = WAL` necesita un lock
 * exclusivo y SQLite puede devolver SQLITE_BUSY sin pasar por el busy handler, así que busy_timeout
 * no lo cubre en un arranque en frío concurrente. Límites fijos: hasta WAL_RETRY_ATTEMPTS intentos,
 * con WAL_RETRY_DELAY_MS entre ellos y un tope total de WAL_RETRY_BUDGET_MS. Al agotarse falla
 * cerrado: cierra la conexión y lanza el error, y openPersistence aborta el arranque. Solo se
 * reintenta SQLITE_BUSY o SQLITE_LOCKED; cualquier otro error se propaga de inmediato.
 */
export const WAL_RETRY_ATTEMPTS = 50;
export const WAL_RETRY_DELAY_MS = 100;
export const WAL_RETRY_BUDGET_MS = 5000;

function isBusy(err: unknown): boolean {
  const e = err as { errcode?: number; message?: string } | null;
  const code = typeof e?.errcode === 'number' ? e.errcode & 0xff : -1;
  return code === 5 || code === 6 || /database (table )?is locked|database is busy/i.test(String(e?.message ?? ''));
}

function enableWal(db: DatabaseSync): void {
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  const start = Date.now();
  let last: unknown = null;
  for (let i = 1; i <= WAL_RETRY_ATTEMPTS; i++) {
    try {
      const row = db.prepare('PRAGMA journal_mode = WAL').get() as { journal_mode?: string } | undefined;
      if (String(row?.journal_mode).toLowerCase() === 'wal') return;
      last = new Error(`journal_mode quedó en ${String(row?.journal_mode)}`);
    } catch (err) {
      if (!isBusy(err)) { db.close(); throw err; }
      last = err;
    }
    if (i === WAL_RETRY_ATTEMPTS || Date.now() - start + WAL_RETRY_DELAY_MS > WAL_RETRY_BUDGET_MS) break;
    Atomics.wait(sleeper, 0, 0, WAL_RETRY_DELAY_MS);
  }
  db.close();
  throw new Error(`GrantDb: no se pudo activar WAL tras el reintento acotado (${WAL_RETRY_ATTEMPTS} intentos / ${WAL_RETRY_BUDGET_MS} ms): ${String((last as Error | null)?.message ?? last)}`);
}

const CONFLICT = Object.freeze({ ok: false, httpStatus: 409, code: 'EFFECT_BINDING_CONFLICT' } as const);

export class GrantDb {
  readonly #db: DatabaseSync;
  readonly #now: () => number;
  readonly #newId: () => string;
  #closed = false;

  constructor(databasePath: string, opts: GrantDbOptions = {}) {
    if (typeof databasePath !== 'string' || databasePath === '' || databasePath === ':memory:' || /^file:/i.test(databasePath)) {
      throw new TypeError('GrantDb requiere una ruta de archivo persistente');
    }
    this.#now = opts.now ?? (() => Math.floor(Date.now() / 1000));
    this.#newId = opts.newId ?? (() => crypto.randomUUID());
    this.#db = new DatabaseSync(databasePath);
    // Codex #65: busy_timeout ANTES del cambio de journal mode y de cualquier DDL.
    this.#db.exec('PRAGMA busy_timeout = 5000;');
    enableWal(this.#db);
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS x402_access_grant (
        grant_id TEXT PRIMARY KEY,
        invoice_hash TEXT NOT NULL UNIQUE,
        settled_txid TEXT NOT NULL UNIQUE,
        nonce TEXT NOT NULL UNIQUE,
        resource_hash TEXT NOT NULL,
        amount_sats TEXT NOT NULL,
        pay_to TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state = 'GRANTED'),
        created_at INTEGER NOT NULL,
        first_delivery_at INTEGER NOT NULL,
        delivery_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS x402_reconciliation (
        invoice_hash TEXT PRIMARY KEY,
        settled_txid TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state = 'RECONCILIATION_REQUIRED'),
        marked_at INTEGER NOT NULL
      );
    `);
  }

  get closed(): boolean {
    return this.#closed;
  }

  /** Algoritmo de INF-042 §8.2 (pasos 1–3) en una transacción local. */
  recordGrant(s: SettlementContext | null | undefined): GrantOutcome {
    const inv = s?.invoice;
    if (!inv || inv.state !== 'PAID' || typeof inv.settledTxid !== 'string' || inv.settledTxid === '') {
      return { ok: false, httpStatus: 500, code: 'X402_CONTEXT_MISSING' };
    }
    const db = this.#db;
    db.exec('BEGIN IMMEDIATE');
    try {
      if (db.prepare('SELECT 1 FROM x402_reconciliation WHERE invoice_hash = ?').get(inv.invoiceHash)) {
        db.exec('COMMIT');
        return { ok: false, httpStatus: 409, code: 'RECONCILIATION_REQUIRED' };
      }
      const t = this.#now();
      const ins = db
        .prepare(
          `INSERT INTO x402_access_grant (grant_id, invoice_hash, settled_txid, nonce, resource_hash, amount_sats, pay_to, state, created_at, first_delivery_at, delivery_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'GRANTED', ?, ?, 0) ON CONFLICT DO NOTHING`,
        )
        .run(this.#newId(), inv.invoiceHash, inv.settledTxid, inv.nonce, inv.resourceHash, inv.amountSats.toString(10), inv.payTo, t, t);
      const by = (col: 'invoice_hash' | 'settled_txid' | 'nonce', v: string): GrantRow | undefined =>
        db.prepare(`SELECT grant_id, invoice_hash, settled_txid, nonce, resource_hash, amount_sats, pay_to FROM x402_access_grant WHERE ${col} = ?`).get(v) as GrantRow | undefined;
      const a = by('invoice_hash', inv.invoiceHash);
      const b = by('settled_txid', inv.settledTxid);
      const c = by('nonce', inv.nonce);
      db.exec('COMMIT');
      if (!a || !b || !c || a.grant_id !== b.grant_id || a.grant_id !== c.grant_id) return CONFLICT;
      if (
        a.settled_txid !== inv.settledTxid ||
        a.nonce !== inv.nonce ||
        a.resource_hash !== inv.resourceHash ||
        a.amount_sats !== inv.amountSats.toString(10) ||
        a.pay_to !== inv.payTo
      ) return CONFLICT;
      return { ok: true, status: Number(ins.changes) === 1 ? 'GRANTED' : 'EFFECT_REPLAYED', grantId: a.grant_id };
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* sin transacción abierta */ }
      if (err instanceof Error && /constraint/i.test(err.message)) return CONFLICT;
      throw err;
    }
  }

  /**
   * Conciliación (INF-042 §8.2 «Fallos entre commit y efecto»; T-03): toda factura PAID sin grant,
   * liquidada hace al menos `minAgeSeconds`, queda marcada RECONCILIATION_REQUIRED para revisión
   * humana. No reembolsa ni mueve fondos. Devuelve los invoiceHash marcados en esta pasada.
   */
  reconcile(source: PaidInvoiceSource, minAgeSeconds: number): string[] {
    if (!Number.isInteger(minAgeSeconds) || minAgeSeconds < 0) throw new RangeError('minAgeSeconds debe ser un entero >= 0');
    const db = this.#db;
    const now = this.#now();
    const marked: string[] = [];
    db.exec('BEGIN IMMEDIATE');
    try {
      const has = db.prepare('SELECT 1 FROM x402_access_grant WHERE invoice_hash = ?');
      const mark = db.prepare(
        `INSERT INTO x402_reconciliation (invoice_hash, settled_txid, state, marked_at) VALUES (?, ?, 'RECONCILIATION_REQUIRED', ?) ON CONFLICT DO NOTHING`,
      );
      for (const p of source.listPaid()) {
        if (now - p.settledAt < minAgeSeconds || has.get(p.invoiceHash)) continue;
        if (Number(mark.run(p.invoiceHash, p.settledTxid, now).changes) === 1) marked.push(p.invoiceHash);
      }
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* sin transacción abierta */ }
      throw err;
    }
    return marked;
  }

  countGrants(): number {
    return Number((this.#db.prepare('SELECT COUNT(*) AS n FROM x402_access_grant').get() as { n: number }).n);
  }

  reconciliationState(invoiceHash: string): string | null {
    const r = this.#db.prepare('SELECT state FROM x402_reconciliation WHERE invoice_hash = ?').get(invoiceHash) as { state: string } | undefined;
    return r?.state ?? null;
  }

  /** Cierre ordenado (TR-01): checkpoint WAL TRUNCATE y close; idempotente. */
  shutdown(): void {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.#db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } finally {
      this.#db.close();
    }
  }
}
