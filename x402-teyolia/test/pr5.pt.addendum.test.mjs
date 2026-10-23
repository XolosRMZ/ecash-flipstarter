// PR-5, tabla PT v1.1 (dictamen del Auditor sobre la tabla PT, §5 y §10): vectores de CARACTERIZACIÓN del
// servidor, solo en test/, sin lógica nueva en src/. Cada vector con su par positivo y negativo por
// fixture (PT5-10). Sin red, sin Chronik real (fixtures), sin llaves; kill switch ON solo aquí.
//   PT-05b: reorg posterior a la concesión. Caracterización: SIN revocación (residual TA-3, PT5-11).
//   PT-01b: el servidor IGNORA la cabecera H2A v2 `PAYMENT-SIGNATURE` (nunca se acepta como pago). PT-01
//           queda parcial hasta PR-5b (M4-S).
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, describe, test } from 'node:test';
import { nextTxid, payingTx, proofHeader } from './fixtures/x402/chronik-fixtures.mjs';
import { issue, server, startApp as startHarness } from './pr4-harness.mjs';
import { PACKAGE_ROOT } from './helpers.mjs';

const { ReadOnlyStoreReader } = await import(pathToFileURL(path.join(PACKAGE_ROOT, 'dist', 'store-reader.js')).href);
const opened = [];
const startApp = async (o) => { const h = await startHarness(o); opened.push(h); return h; };
after(async () => { for (const h of opened) { try { await h.close(); } catch { /* ya cerrado */ } } });
const BLOCK = (ts) => ({ height: 900_000, hash: 'ab'.repeat(32), timestamp: ts });

/** Factura pagada con una tx cuyo estado controla el test (`gone()`: Chronik no la encuentra). */
async function grantedWith(h, txOpts) {
  const { invoice, invoiceHash } = await issue(h);
  const txid = nextTxid();
  const state = { tx: { ...payingTx({ payTo: invoice.payTo, timeFirstSeen: h.clock.t, ...txOpts }), txid } };
  const live = () => state.tx;
  h.provider.set(txid, live);
  state.gone = () => h.provider.set(txid, undefined);     // TxNotFoundError del fixture
  state.back = () => h.provider.set(txid, live);
  const proof = proofHeader(invoiceHash, txid);
  const first = await h.req('GET', server.DEMO_ROUTE, { 'payment-proof': proof });
  assert.equal(first.status, 200); assert.equal(first.json.status, 'GRANTED');
  return { invoice, invoiceHash, txid, proof, state, grantId: first.json.grantId };
}

async function assertNotRevoked(h, { invoiceHash, grantId }) {
  assert.equal(h.grants.countGrants(), 1, 'el grant persiste (sin revocación)');
  assert.equal(h.grants.deliveryCount(grantId), 0, 'deliveryCount sin cambio');
  assert.equal((await h.store.getByInvoiceHash(invoiceHash)).state, 'PAID', 'la factura sigue PAID');
}

describe('PT-05b: reorg posterior a la concesión — caracterización: sin revocación (residual TA-3)', () => {
  test('tx final -> 200; la tx desaparece -> 402 con nueva consulta a Chronik; vuelve sin finalidad -> 402; otro txid -> 409; vuelve final -> 200 EFFECT_REPLAYED', async () => {
    const h = await startApp();
    const g = await grantedWith(h, { isFinal: true });
    const tx = g.state.tx;
    g.state.gone();
    const c0 = h.provider.calls;
    const gone = await h.req('GET', server.DEMO_ROUTE, { 'payment-proof': g.proof });
    assert.equal(gone.status, 402, gone.body); assert.equal(gone.json.error, 'TX_NOT_FOUND');
    assert.equal(h.provider.calls, c0 + 1, 'la reentrega vuelve a consultar la Chronik del servidor');
    await assertNotRevoked(h, g);
    g.state.back(); g.state.tx = { ...tx, isFinal: false };
    const notFinal = await h.req('GET', server.DEMO_ROUTE, { 'payment-proof': g.proof });
    assert.equal(notFinal.status, 402); assert.equal(notFinal.json.error, 'TRANSACTION_NOT_FINAL');
    await assertNotRevoked(h, g);
    const other = nextTxid();
    h.provider.set(other, { ...payingTx({ payTo: g.invoice.payTo, timeFirstSeen: h.clock.t }), txid: other });
    const conflict = await h.req('GET', server.DEMO_ROUTE, { 'payment-proof': proofHeader(g.invoiceHash, other) });
    assert.equal(conflict.status, 409); assert.equal(conflict.json.error, 'TXID_CONFLICT');
    await assertNotRevoked(h, g);
    // Par positivo: la tx vuelve a ser final -> 200 EFFECT_REPLAYED con el mismo grant.
    g.state.tx = tx;
    const back = await h.req('GET', server.DEMO_ROUTE, { 'payment-proof': g.proof });
    assert.equal(back.status, 200); assert.equal(back.json.status, 'EFFECT_REPLAYED');
    assert.equal(back.json.grantId, g.grantId); assert.equal(back.json.deliveryCount, 1);
    assert.equal(h.grants.countGrants(), 1);
    // La conciliación posterior no marca nada: hay grant.
    h.clock.t += 4000;
    const reader = new ReadOnlyStoreReader(path.join(h.dir, 'store.sqlite'));
    try { assert.deepEqual(h.grants.reconcile(reader), []); } finally { reader.close(); }
    assert.equal(h.grants.reconciliationState(g.invoiceHash), null);
  });
  test('A-02 (bloque sin isFinal) -> 200; se retira el bloque -> 402 TRANSACTION_NOT_FINAL; grant y PAID persisten', async () => {
    const h = await startApp();
    const g = await grantedWith(h, { isFinal: false, block: BLOCK(1_791_400_000) });
    const { block, ...noBlock } = g.state.tx;
    g.state.tx = noBlock;
    const r = await h.req('GET', server.DEMO_ROUTE, { 'payment-proof': g.proof });
    assert.equal(r.status, 402); assert.equal(r.json.error, 'TRANSACTION_NOT_FINAL');
    await assertNotRevoked(h, g);
  });
  test('par positivo: sin reorg (tx siempre final) la reentrega da 200 EFFECT_REPLAYED', async () => {
    const h = await startApp();
    const g = await grantedWith(h, { isFinal: true });
    const r = await h.req('GET', server.DEMO_ROUTE, { 'payment-proof': g.proof });
    assert.equal(r.status, 200); assert.equal(r.json.status, 'EFFECT_REPLAYED');
  });
});

describe('PT-01b: cabecera H2A v2 PAYMENT-SIGNATURE — el servidor la ignora (PT-01 parcial hasta PR-5b)', () => {
  const sig = Buffer.from(JSON.stringify({ x402Version: 2, scheme: 'exact', payload: { signature: 'ab'.repeat(32) } })).toString('base64');
  test('solo PAYMENT-SIGNATURE -> 402 con oferta C3B; 0 grants; 0 consultas a Chronik', async () => {
    const h = await startApp();
    const r = await h.req('GET', server.DEMO_ROUTE, { 'payment-signature': sig });
    assert.equal(r.status, 402); assert.ok(r.json?.invoice, 'oferta C3B');
    assert.equal(h.grants.countGrants(), 0); assert.equal(h.provider.calls, 0);
  });
  test('PAYMENT-SIGNATURE + payment-proof C3B válida -> 200 GRANTED (la cabecera H2A v2 se ignora, no se rechaza)', async () => {
    const h = await startApp();
    const { invoice, invoiceHash } = await issue(h);
    const txid = nextTxid();
    h.provider.set(txid, { ...payingTx({ payTo: invoice.payTo, timeFirstSeen: h.clock.t }), txid });
    const r = await h.req('GET', server.DEMO_ROUTE, { 'payment-signature': sig, 'payment-proof': proofHeader(invoiceHash, txid) });
    assert.equal(r.status, 200); assert.equal(r.json.status, 'GRANTED');
  });
  test('par negativo: PAYMENT-SIGNATURE + payment-proof con txid desconocido -> nunca 200; 0 grants', async () => {
    const h = await startApp();
    const { invoiceHash } = await issue(h);
    const r = await h.req('GET', server.DEMO_ROUTE, { 'payment-signature': sig, 'payment-proof': proofHeader(invoiceHash, nextTxid()) });
    assert.notEqual(r.status, 200); assert.equal(h.grants.countGrants(), 0);
  });
});
