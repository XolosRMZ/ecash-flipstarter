// PR-3: store de facturas, DB del grant y cierre ordenado (INF-045 §5.3 RQ-04, RQ-08; INF-042 §8.2,
// §11.4 T-01 a T-05 y T-07; INF-045 §6.2 T-18). Fixtures sintéticos (DEC-AX-09 (a)): sin red, sin
// llaves, sin Chronik; la liquidación se inyecta como `request.x402Settlement` ya verificado y el
// store se ejercita con commitPaid directo. Kill switch ON solo en procesos de prueba (DEC-AX-08 (a)).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { PACKAGE_ROOT, baselineEnv, http, launch, makeTmp } from './helpers.mjs';

const dist = (f) => pathToFileURL(path.join(PACKAGE_ROOT, 'dist', f)).href;
const { GrantDb } = await import(dist('grant-db.js'));
const { X402InvoiceStore } = await import(dist('invoice-store.js'));
const { readPersistenceConfig, PersistenceConfigError } = await import(dist('persistence-config.js'));

const hex = (c, n = 64) => c.repeat(n).slice(0, n);
let seq = 0;
/** Factura sintética (no es una dirección ni un hash real; no deriva nada). */
function synthInvoice(tag = String(++seq)) {
  const t = tag.padStart(4, '0');
  return {
    invoiceHash: hex(`a${t}`), nonce: hex(`b${t}`, 32), resourceHash: hex(`c${t}`), amountSats: 546n,
    payTo: `ecash:qsynthetic${t}`, network: 'xec:mainnet', scheme: 'exact', issuedAt: 1_000, expiresAt: 2_000, state: 'ISSUED',
  };
}
const settlementOf = (rec, txid) => ({ ok: true, invoice: { ...rec, state: 'PAID', settledTxid: txid } });
const tx = (c) => hex(c);
function freshDir(prefix) { return makeTmp(prefix).dir; }

describe('PR-3 grant (INF-042 §8.2): T-01, T-04, contexto y restricciones', () => {
  const dir = freshDir('x402-pr3-g-');
  const g = new GrantDb(path.join(dir, 'grant.sqlite'), { now: () => 1_500 });
  test('T-01: next() dos veces para la misma factura -> 1 fila; la segunda es EFFECT_REPLAYED con el mismo grant_id', () => {
    const s = settlementOf(synthInvoice(), tx('1'));
    const a = g.recordGrant(s);
    const b = g.recordGrant(s);
    assert.equal(a.ok && a.status, 'GRANTED');
    assert.equal(b.ok && b.status, 'EFFECT_REPLAYED');
    assert.equal(b.grantId, a.grantId);
    assert.equal(g.countGrants(), 1);
  });
  test('T-04: grant existente y liquidación con txid distinto -> 409 EFFECT_BINDING_CONFLICT (sin fila nueva)', () => {
    const rec = synthInvoice();
    assert.equal(g.recordGrant(settlementOf(rec, tx('2'))).status, 'GRANTED');
    const n = g.countGrants();
    assert.deepEqual(g.recordGrant(settlementOf(rec, tx('3'))), { ok: false, httpStatus: 409, code: 'EFFECT_BINDING_CONFLICT' });
    for (const field of ['resourceHash', 'payTo']) {
      assert.equal(g.recordGrant({ invoice: { ...settlementOf(rec, tx('2')).invoice, [field]: 'x' } }).code, 'EFFECT_BINDING_CONFLICT', field);
    }
    assert.equal(g.recordGrant({ invoice: { ...settlementOf(rec, tx('2')).invoice, amountSats: 547n } }).code, 'EFFECT_BINDING_CONFLICT');
    assert.equal(g.countGrants(), n);
  });
  test('choque solo en settled_txid o solo en nonce -> 409, nunca 500 (§8.2 paso 2)', () => {
    const r1 = synthInvoice();
    assert.equal(g.recordGrant(settlementOf(r1, tx('4'))).status, 'GRANTED');
    const n = g.countGrants();
    assert.equal(g.recordGrant(settlementOf(synthInvoice(), tx('4'))).code, 'EFFECT_BINDING_CONFLICT');
    assert.equal(g.recordGrant(settlementOf({ ...synthInvoice(), nonce: r1.nonce }, tx('5'))).code, 'EFFECT_BINDING_CONFLICT');
    assert.equal(g.countGrants(), n);
  });
  test('X402_CONTEXT_MISSING (500, fail-closed): sin contexto, factura no PAID o sin txid', () => {
    for (const s of [undefined, null, {}, { invoice: synthInvoice() }, { invoice: { ...synthInvoice(), state: 'PAID' } }, { invoice: { ...synthInvoice(), state: 'PAID', settledTxid: '' } }]) {
      assert.deepEqual(g.recordGrant(s), { ok: false, httpStatus: 500, code: 'X402_CONTEXT_MISSING' });
    }
  });
  test('esquema: UNIQUE en invoice_hash, settled_txid y nonce; state solo GRANTED; delivery_count 0 (se cuenta en PR-4)', () => {
    const db = new DatabaseSync(path.join(dir, 'grant.sqlite'), { readOnly: true });
    const idx = db.prepare("SELECT name FROM pragma_index_list('x402_access_grant') WHERE \"unique\" = 1").all().length;
    assert.ok(idx >= 3);
    const cols = db.prepare("SELECT name FROM pragma_table_info('x402_access_grant')").all().map((r) => r.name);
    assert.deepEqual(cols, ['grant_id', 'invoice_hash', 'settled_txid', 'nonce', 'resource_hash', 'amount_sats', 'pay_to', 'state', 'created_at', 'first_delivery_at', 'delivery_count']);
    assert.ok(db.prepare('SELECT delivery_count FROM x402_access_grant').all().every((r) => r.delivery_count === 0));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name);
    assert.deepEqual(tables, ['x402_access_grant', 'x402_reconciliation'], 'sin ledger, contadores ni outbox (§8.2 paso 4)');
    db.close();
  });
  test('GrantDb rechaza rutas volátiles (:memory:, file:)', () => {
    for (const p of [':memory:', 'file:x.db', '']) assert.throws(() => new GrantDb(p), TypeError);
  });
});

describe('PR-3 store + grant: T-02, T-03 (fallo entre commitPaid y el grant)', () => {
  const dir = freshDir('x402-pr3-s-');
  const store = new X402InvoiceStore(path.join(dir, 'store.sqlite'));
  let now = 10_000;
  const g = new GrantDb(path.join(dir, 'grant.sqlite'), { now: () => now });
  const paidSource = (records) => ({ *listPaid() { for (const r of records) yield r; } });
  test('T-02: fallo inyectado tras commitPaid y antes del grant; reintento con la misma prueba -> grant creado, total 1', async () => {
    const rec = synthInvoice();
    await store.issue(rec);
    const first = await store.commitPaid(rec.invoiceHash, tx('7'), 1_100);
    assert.equal(first.ok && first.idempotent, false);
    // (fallo inyectado: el handler no llega a recordGrant)
    const retry = await store.commitPaid(rec.invoiceHash, tx('7'), 1_200);
    assert.equal(retry.ok && retry.idempotent, true);
    const before = g.countGrants();
    assert.equal(g.recordGrant({ ok: true, invoice: retry.record }).status, 'GRANTED');
    assert.equal(g.recordGrant({ ok: true, invoice: retry.record }).status, 'EFFECT_REPLAYED');
    assert.equal(g.countGrants(), before + 1);
  });
  test('T-03: fallo sin reintento -> la conciliación marca RECONCILIATION_REQUIRED; sin grant y sin movimiento de fondos', async () => {
    const rec = synthInvoice();
    await store.issue(rec);
    const paid = await store.commitPaid(rec.invoiceHash, tx('8'), 9_000);
    const src = paidSource([{ invoiceHash: rec.invoiceHash, settledTxid: tx('8'), settledAt: paid.record.settledAt }]);
    assert.deepEqual(g.reconcile(src, 3_600), [], 'dentro de la ventana todavía no se marca');
    now = 9_000 + 3_600;
    assert.deepEqual(g.reconcile(src, 3_600), [rec.invoiceHash]);
    assert.deepEqual(g.reconcile(src, 3_600), [], 'idempotente');
    assert.equal(g.reconciliationState(rec.invoiceHash), 'RECONCILIATION_REQUIRED');
    assert.deepEqual(g.recordGrant({ ok: true, invoice: paid.record }), { ok: false, httpStatus: 409, code: 'RECONCILIATION_REQUIRED' });
    assert.equal((await store.getByInvoiceHash(rec.invoiceHash)).state, 'PAID', 'el store x402 no cambia');
  });
  test('T-03 (negativo): factura PAID con grant no se marca', async () => {
    const rec = synthInvoice();
    await store.issue(rec);
    const paid = await store.commitPaid(rec.invoiceHash, tx('9'), 1);
    assert.equal(g.recordGrant({ ok: true, invoice: paid.record }).status, 'GRANTED');
    assert.deepEqual(g.reconcile(paidSource([{ invoiceHash: rec.invoiceHash, settledTxid: tx('9'), settledAt: 1 }]), 0), []);
    assert.equal(g.reconciliationState(rec.invoiceHash), null);
    assert.throws(() => g.reconcile(paidSource([]), -1), RangeError);
  });
  test('el store es el de @x402-xec/core/sqlite (durable) y cierra con checkpoint; shutdown idempotente', () => {
    assert.equal(store.isDurable, true);
    g.shutdown(); g.shutdown();
    store.shutdown(); store.shutdown();
    for (const f of ['store.sqlite', 'grant.sqlite']) {
      assert.ok(existsSync(path.join(dir, f)));
      assert.ok(!existsSync(path.join(dir, `${f}-wal`)) && !existsSync(path.join(dir, `${f}-shm`)), `${f}: sin -wal/-shm`);
    }
  });
});

describe('PR-3 T-05: dos procesos Teyolia sobre la misma DB del grant', () => {
  const runner = (dbPath, settlementJson, n) => new Promise((resolve, reject) => {
    const code = `
      const { GrantDb } = await import(${JSON.stringify(dist('grant-db.js'))});
      const s = JSON.parse(process.argv[1]); s.invoice.amountSats = BigInt(s.invoice.amountSats);
      const g = new GrantDb(process.argv[2]);
      const out = [];
      for (let i = 0; i < ${n}; i++) { const r = g.recordGrant(s); out.push(r.ok ? r.status + ':' + r.grantId : r.code); }
      g.shutdown();
      process.stdout.write(JSON.stringify(out));`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, settlementJson, dbPath], { env: { PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('exit', (c) => (c === 0 ? resolve(JSON.parse(out)) : reject(new Error(err))));
  });
  test('la misma liquidación desde dos procesos a la vez -> exactamente 1 grant (UNIQUE); límite G-12 documentado', async () => {
    const dir = freshDir('x402-pr3-t05-');
    const db = path.join(dir, 'grant.sqlite');
    new GrantDb(db).shutdown();
    const s = settlementOf(synthInvoice(), tx('e'));
    const json = JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    const [a, b] = await Promise.all([runner(db, json, 40), runner(db, json, 40)]);
    const all = [...a, ...b];
    assert.equal(all.filter((x) => x.startsWith('GRANTED:')).length, 1);
    assert.equal(new Set(all.map((x) => x.split(':')[1])).size, 1, 'mismo grant_id en todas las respuestas');
    assert.ok(all.every((x) => /^(GRANTED|EFFECT_REPLAYED):/.test(x)));
    const g = new GrantDb(db);
    assert.equal(g.countGrants(), 1);
    g.shutdown();
  });
});

describe('PR-3 T-18 y configuración de persistencia (fail-closed)', () => {
  const ok = (dir) => ({ TEYOLIA_X402_STORE_PATH: path.join(dir, 'store.sqlite'), TEYOLIA_X402_GRANT_DB_PATH: path.join(dir, 'grant.sqlite') });
  test('positivo: dos archivos propios y distintos en un directorio sin campaigns.db', () => {
    const dir = freshDir('x402-pr3-c-');
    const cfg = readPersistenceConfig(ok(dir));
    assert.notEqual(cfg.storePath, cfg.grantDbPath);
  });
  const bad = [
    ['falta STORE_PATH', (d) => ({ ...ok(d), TEYOLIA_X402_STORE_PATH: undefined }), /TEYOLIA_X402_STORE_PATH: obligatoria/],
    ['falta GRANT_DB_PATH', (d) => ({ ...ok(d), TEYOLIA_X402_GRANT_DB_PATH: '' }), /TEYOLIA_X402_GRANT_DB_PATH: obligatoria/],
    ['store = grant', (d) => ({ ...ok(d), TEYOLIA_X402_GRANT_DB_PATH: path.join(d, 'store.sqlite') }), /archivo distinto/],
    ['grant = -wal del store', (d) => ({ ...ok(d), TEYOLIA_X402_GRANT_DB_PATH: path.join(d, 'store.sqlite-wal') }), /archivo distinto/],
    ['ruta relativa', (d) => ({ ...ok(d), TEYOLIA_X402_STORE_PATH: 'store.sqlite' }), /absoluta/],
    [':memory:', (d) => ({ ...ok(d), TEYOLIA_X402_GRANT_DB_PATH: ':memory:' }), /volátil/],
    ['URI file:', (d) => ({ ...ok(d), TEYOLIA_X402_STORE_PATH: `file:${d}/s.db` }), /volátil/],
    ['T-18: basename campaigns.db', (d) => ({ ...ok(d), TEYOLIA_X402_STORE_PATH: path.join(d, 'sub', 'campaigns.db') }), /campaigns\.db/],
    ['T-18: CAMPAIGNS.DB (mayúsculas)', (d) => ({ ...ok(d), TEYOLIA_X402_GRANT_DB_PATH: path.join(d, 'CAMPAIGNS.DB') }), /campaigns\.db/],
    ['T-18: directorio que contiene campaigns.db', (d) => { writeFileSync(path.join(d, 'campaigns.db'), ''); return ok(d); }, /contiene la DB legacy/],
    ['T-18: enlace simbólico hacia campaigns.db', (d) => { const l = freshDir('x402-pr3-legacy-'); writeFileSync(path.join(l, 'campaigns.db'), ''); symlinkSync(path.join(l, 'campaigns.db'), path.join(d, 'grant.sqlite')); return ok(d); }, /enlace hacia la DB legacy/],
    ['directorio inexistente', (d) => ({ ...ok(d), TEYOLIA_X402_STORE_PATH: path.join(d, 'no', 'store.sqlite') }), /no existe/],
  ];
  for (const [label, mk, re] of bad) {
    test(`rechaza: ${label}`, () => {
      const d = freshDir('x402-pr3-c-');
      if (label.includes('basename')) mkdirSync(path.join(d, 'sub'));
      const env = mk(d);
      for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
      assert.throws(() => readPersistenceConfig(env), (e) => e instanceof PersistenceConfigError && re.test(e.message));
    });
  }
  test('T-18 (proceso): ON con la DB del grant en el directorio de campaigns.db -> no arranca (78) y campaigns.db queda intacta', async () => {
    const home = freshDir('x402-pr3-home-');
    const legacy = freshDir('x402-pr3-legacy-');
    writeFileSync(path.join(legacy, 'campaigns.db'), 'LEGACY');
    const before = statSync(path.join(legacy, 'campaigns.db'));
    const env = { ...baselineEnv(home), TEYOLIA_X402_ENABLED: 'true', ...ok(home), TEYOLIA_X402_GRANT_DB_PATH: path.join(legacy, 'grant.sqlite') };
    const r = await launch({ env, cwd: freshDir('x402-cwd-') });
    if (r.started) { await r.stop(); assert.fail('arrancó'); }
    assert.equal(r.code, 78);
    assert.match(r.stderr, /persistencia rechazada: TEYOLIA_X402_GRANT_DB_PATH \(el directorio contiene la DB legacy campaigns\.db \(T-18\)\)/);
    assert.equal(readFileSync(path.join(legacy, 'campaigns.db'), 'utf8'), 'LEGACY');
    assert.equal(statSync(path.join(legacy, 'campaigns.db')).mtimeMs, before.mtimeMs);
    assert.ok(!existsSync(path.join(legacy, 'grant.sqlite')) && !existsSync(path.join(home, 'store.sqlite')), 'no se crea ningún archivo');
  });
  test('kill switch OFF: no se crea ni se abre ningún archivo aunque las rutas estén configuradas (R-14)', async () => {
    const home = freshDir('x402-pr3-home-');
    const r = await launch({ env: { ...baselineEnv(home), ...ok(home) }, cwd: freshDir('x402-cwd-') });
    assert.equal(r.started, true, r.stderr);
    const d = await http(r.port, 'GET', '/x402/v1/access/demo');
    assert.equal(d.json.error, 'TEYOLIA_X402_DISABLED');
    await r.stop();
    assert.ok(!existsSync(path.join(home, 'store.sqlite')) && !existsSync(path.join(home, 'grant.sqlite')));
  });
});

describe('PR-3 T-07 (TR-01): cierre ordenado con el store x402 abierto', () => {
  const start = async () => {
    const home = freshDir('x402-pr3-t07-');
    const env = { ...baselineEnv(home), TEYOLIA_X402_ENABLED: 'true', TEYOLIA_X402_STORE_PATH: path.join(home, 'store.sqlite'), TEYOLIA_X402_GRANT_DB_PATH: path.join(home, 'grant.sqlite') };
    const r = await launch({ env, cwd: freshDir('x402-cwd-') });
    assert.equal(r.started, true, r.stderr);
    return { home, env, r };
  };
  const side = (home) => ['store.sqlite', 'grant.sqlite'].flatMap((f) => [`${f}-wal`, `${f}-shm`]).filter((f) => existsSync(path.join(home, f)));
  for (const sig of ['SIGTERM', 'SIGINT']) {
    test(`${sig}: sale con 0, sin -wal/-shm residual y el siguiente arranque no se bloquea`, async () => {
      const { home, env, r } = await start();
      assert.equal(side(home).length, 4, 'control: con el proceso vivo existen -wal y -shm de ambas DB');
      const h = await http(r.port, 'GET', '/teyolia-x402/health');
      assert.equal(h.json.x402Enabled, true);
      assert.equal(h.json.limitsZero, true);
      const exit = await new Promise((res) => { r.child.once('exit', (code, signal) => res({ code, signal })); r.child.kill(sig); });
      assert.deepEqual(exit, { code: 0, signal: null });
      assert.deepEqual(side(home), []);
      const again = await launch({ env, cwd: freshDir('x402-cwd-') });
      assert.equal(again.started, true, again.stderr);
      await again.stop();
      const db = new DatabaseSync(path.join(home, 'store.sqlite'), { readOnly: true });
      assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
      db.close();
    });
  }
  test('control negativo: SIGKILL (sin cierre ordenado) deja -wal/-shm; el test detecta la diferencia', async () => {
    const { home, r } = await start();
    await new Promise((res) => { r.child.once('exit', res); r.child.kill('SIGKILL'); });
    assert.ok(side(home).length > 0);
  });
});
