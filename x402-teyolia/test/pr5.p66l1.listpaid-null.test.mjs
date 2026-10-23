// P66Δ-L1 (dictamen delta #66; PR-5): listPaid() no filtra las filas PAID con settled_txid o
// settled_at NULL, así que reconcile() falla cerrada (ReconcileDataError + rollback) en vez de
// omitirlas en silencio. Control negativo: en f23146f la fila se filtraba y reconcile() daba [].
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { PACKAGE_ROOT, makeTmp } from './helpers.mjs';

const dist = (f) => pathToFileURL(path.join(PACKAGE_ROOT, 'dist', f)).href;
const { GrantDb } = await import(dist('grant-db.js'));
const { X402InvoiceStore } = await import(dist('invoice-store.js'));
const { ReadOnlyStoreReader } = await import(dist('store-reader.js'));

const hex = (c, n = 64) => c.repeat(n).slice(0, n);
let seq = 0;
function synth() {
  const t = String(++seq).padStart(4, '0');
  return { invoiceHash: hex(`a${t}`), nonce: hex(`b${t}`, 32), resourceHash: hex(`c${t}`), amountSats: 546n, payTo: `ecash:qsynthp66${t}`,
    network: 'xec:mainnet', scheme: 'exact', issuedAt: 1_000, expiresAt: 1_300, state: 'ISSUED' };
}

async function storeWith(corrupt) {
  const dir = makeTmp('x402-p66l1-').dir;
  const sp = path.join(dir, 'store.sqlite');
  const store = new X402InvoiceStore(sp);
  const good = synth(); const bad = synth();
  for (const r of [good, bad]) await store.issue(r);
  await store.commitPaid(good.invoiceHash, hex('1'), 1_100);
  await store.commitPaid(bad.invoiceHash, hex('2'), 1_100);
  store.shutdown();
  const w = new DatabaseSync(sp);
  w.prepare(`UPDATE invoices SET ${corrupt} = NULL WHERE invoice_hash = ?`).run(bad.invoiceHash);
  w.close();
  return { dir, sp, good, bad };
}

describe('P66Δ-L1: PAID con NULL -> reconcile falla cerrada', () => {
  for (const col of ['settled_txid', 'settled_at']) {
    test(`PAID con ${col} NULL: listPaid la entrega y reconcile lanza ReconcileDataError; nada marcado`, async () => {
      const f = await storeWith(col);
      const reader = new ReadOnlyStoreReader(f.sp);
      const listed = [...reader.listPaid()].map((p) => p.invoiceHash);
      assert.deepEqual(listed, [f.good.invoiceHash, f.bad.invoiceHash].sort(), 'la fila corrupta no se omite');
      const g = new GrantDb(path.join(f.dir, 'grant.sqlite'), { now: () => 100_000 });
      assert.throws(() => g.reconcile(reader), (e) => e?.name === 'ReconcileDataError' && e.invoiceHash === f.bad.invoiceHash);
      assert.equal(g.reconciliationState(f.good.invoiceHash), null, 'rollback: la válida tampoco se marca en esa pasada');
      assert.equal(g.reconciliationState(f.bad.invoiceHash), null);
      reader.close(); g.shutdown();
    });
  }
  test('control positivo: sin NULL la conciliación marca las dos', async () => {
    const dir = makeTmp('x402-p66l1p-').dir;
    const sp = path.join(dir, 'store.sqlite');
    const store = new X402InvoiceStore(sp);
    const a = synth(); const b = synth();
    for (const r of [a, b]) { await store.issue(r); await store.commitPaid(r.invoiceHash, hex(r === a ? '3' : '4'), 1_100); }
    store.shutdown();
    const reader = new ReadOnlyStoreReader(sp);
    const g = new GrantDb(path.join(dir, 'grant.sqlite'), { now: () => 100_000 });
    assert.deepEqual(g.reconcile(reader), [a.invoiceHash, b.invoiceHash].sort());
    reader.close(); g.shutdown();
  });
});
