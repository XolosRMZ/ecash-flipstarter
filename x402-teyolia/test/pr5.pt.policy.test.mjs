// PR-5: casos que faltaban de PT-01..PT-07 (INF-045 §6.4; tabla en docs/pr5-pt-correspondencia.md).
// Solo test/: adaptadores inyectados, Chronik por fixtures y CAE simulado (test/fixtures/x402/
// cae-sim.mjs). No hay lógica de política nueva en src/. Sin red, sin llaves y sin fondos; límites
// en cero; kill switch ON solo en este proceso de prueba (DEC-AX-08 (a)).
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, describe, test } from 'node:test';
import { nextTxid, payingTx, proofHeader } from './fixtures/x402/chronik-fixtures.mjs';
import { agentMayPay, simulatedBudget, simulatedCae } from './fixtures/x402/cae-sim.mjs';
import { ON_ENV, issue, server, startApp as startHarness } from './pr4-harness.mjs';
import { PACKAGE_ROOT } from './helpers.mjs';

const dist = (f) => pathToFileURL(path.join(PACKAGE_ROOT, 'dist', f)).href;
const { ZERO_LIMITS } = await import(dist('policy.js'));
const { ReadOnlyStoreReader } = await import(dist('store-reader.js'));

const OFF_ENV = Object.freeze({ NODE_ENV: 'test' });
// Cierre garantizado aunque falle una aserción (evita runners colgados en el control negativo).
const opened = [];
const startApp = async (o) => { const h = await startHarness(o); opened.push(h); return h; };
after(async () => { for (const h of opened) { try { await h.close(); } catch { /* ya cerrado */ } } });
const raw = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

async function paid(h) {
  const { invoice, invoiceHash } = await issue(h);
  const txid = nextTxid();
  h.provider.set(txid, { ...payingTx({ payTo: invoice.payTo, timeFirstSeen: h.clock.t }), txid });
  return { invoice, invoiceHash, txid, proof: proofHeader(invoiceHash, txid) };
}

describe('PT-01: versiones desconocidas', () => {
  test('PT-01a: x402Version 0, 3, "1", 1.5, null o ausente -> 400 MALFORMED_PROOF; sin PAID, sin grant, sin Chronik', async () => {
    const h = await startApp();
    const { invoiceHash, txid } = await paid(h);
    const base = { invoiceHash, network: 'xec:mainnet', txid };
    for (const v of [0, 3, '1', 1.5, null, undefined]) {
      const body = v === undefined ? base : { ...base, x402Version: v };
      const r = await h.req('GET', server.DEMO_ROUTE, { 'payment-proof': raw(body) });
      assert.equal(r.status, 400, `x402Version=${JSON.stringify(v)}`); assert.equal(r.json.error, 'MALFORMED_PROOF');
    }
    assert.equal(h.provider.calls, 0, 'una prueba mal formada no llega a Chronik');
    assert.equal((await h.store.getByInvoiceHash(invoiceHash)).state, 'ISSUED');
    assert.equal(h.grants.countGrants(), 0);
    await h.close();
  });
});

describe('PT-02: CAE simulado, expiración y revocación', () => {
  test('PT-02a: señales con forma de CAE o de aprobación humana no sustituyen a la prueba', async () => {
    const h = await startApp();
    const { invoiceHash, txid } = await paid(h);
    for (const hd of [{ 'x-cae-decision': 'approved' }, { 'x-human-approval': 'approved' }, { 'x-cae-decision': 'approved', 'x-wallet-approval': '1' }]) {
      const r = await h.req('GET', server.DEMO_ROUTE, hd);
      assert.equal(r.status, 402, JSON.stringify(hd)); assert.notEqual(r.json?.status, 'GRANTED');
    }
    for (const extra of [{ caeDecision: 'approved' }, { humanApproval: { approved: true } }]) {
      const r = await h.req('GET', server.DEMO_ROUTE, { 'payment-proof': proofHeader(invoiceHash, txid, extra) });
      assert.equal(r.status, 400); assert.equal(r.json.error, 'MALFORMED_PROOF');
    }
    assert.equal(h.grants.countGrants(), 0);
    await h.close();
  });

  const intent = { digest: 'f'.repeat(64), amountSats: '1000', network: 'xec:mainnet' };
  const scenarios = [
    ['CAE unavailable', () => { throw new Error('unavailable'); }, {}, false],
    ['CAE rejected', (t) => ({ version: 1, decision: 'rejected', expiresAt: t + 60 }), {}, false],
    ['CAE versión desconocida', (t) => ({ version: 2, decision: 'approved', expiresAt: t + 60 }), {}, false],
    ['CAE decisión desconocida', (t) => ({ version: 1, decision: 'approved_maybe', expiresAt: t + 60 }), {}, false],
    ['CAE decisión vencida', (t) => ({ version: 1, decision: 'approved', expiresAt: t }), {}, false],
    ['needs_human_approval sin aprobación', (t) => ({ version: 1, decision: 'needs_human_approval', expiresAt: t + 60 }), { human: async () => null }, false],
    ['needs_human_approval con aprobación de otra intención', (t) => ({ version: 1, decision: 'needs_human_approval', expiresAt: t + 60 }), { human: async () => ({ approved: true, intentDigest: '0'.repeat(64) }) }, false],
    ['needs_human_approval: vence durante la espera', (t) => ({ version: 1, decision: 'needs_human_approval', expiresAt: t + 60 }), { human: 'expire' }, false],
    ['needs_human_approval: revocada durante la espera', (t) => ({ version: 1, decision: 'needs_human_approval', expiresAt: t + 60 }), { human: 'revoke' }, false],
    ['approved (control positivo)', (t) => ({ version: 1, decision: 'approved', expiresAt: t + 60 }), {}, true],
    ['needs_human_approval con aprobación enlazada (control positivo)', (t) => ({ version: 1, decision: 'needs_human_approval', expiresAt: t + 60 }), { human: async () => ({ approved: true, intentDigest: intent.digest }) }, true],
  ];
  for (const [label, script, opts, expectPay] of scenarios) {
    test(`PT-02b: ${label} -> ${expectPay ? 'paga una vez y 200' : 'no paga; sin PAID, sin grant y sin Chronik'}`, async () => {
      const h = await startApp();
      const { invoice, invoiceHash } = await issue(h);
      let revokedFlag = false;
      const t0 = h.clock.t;
      const cae = simulatedCae(() => script(t0));
      let human = opts.human;
      if (human === 'expire') human = async () => { h.clock.t = t0 + 61; return { approved: true, intentDigest: intent.digest }; };
      if (human === 'revoke') human = async () => { revokedFlag = true; return { approved: true, intentDigest: intent.digest }; };
      const verdict = await agentMayPay({ cae, intent, now: () => h.clock.t, human, revoked: () => revokedFlag });
      h.clock.t = t0 + 1;
      assert.equal(verdict.pay, expectPay, verdict.reason);
      assert.equal(cae.calls, 1);
      if (verdict.pay) {
        const txid = nextTxid();
        h.provider.set(txid, { ...payingTx({ payTo: invoice.payTo, timeFirstSeen: h.clock.t }), txid });
        const r = await h.req('GET', server.DEMO_ROUTE, { 'payment-proof': proofHeader(invoiceHash, txid) });
        assert.equal(r.status, 200); assert.equal(r.json.status, 'GRANTED');
        assert.equal(h.grants.countGrants(), 1);
      } else {
        assert.equal(h.provider.calls, 0);
        assert.equal((await h.store.getByInvoiceHash(invoiceHash)).state, 'ISSUED');
        assert.equal(h.grants.countGrants(), 0);
      }
      await h.close();
    });
  }

  test('PT-02c: revocación durante la espera (reinicio con kill switch OFF) -> 503 con la misma prueba, sin grant', async () => {
    const h1 = await startApp();
    const { proof, invoiceHash } = await paid(h1);
    await h1.close();
    const h2 = await startApp({ env: OFF_ENV, dir: h1.dir, start: h1.clock.t + 10 });
    const r = await h2.req('GET', server.DEMO_ROUTE, { 'payment-proof': proof });
    assert.equal(r.status, 503); assert.equal(r.json.error, 'TEYOLIA_X402_DISABLED');
    assert.equal(h2.provider.calls, 0);
    assert.equal((await h2.store.getByInvoiceHash(invoiceHash)).state, 'ISSUED');
    assert.equal(h2.grants.countGrants(), 0);
    await h2.close();
  });
});

describe('PT-03: campos extra con secretos o raw tx', () => {
  test('PT-03a: rawTx, privateKey, seed o mnemonic en la prueba -> 400; la respuesta no repite el valor; sin Chronik', async () => {
    const h = await startApp();
    const { invoiceHash, txid } = await paid(h);
    const secrets = {
      rawTx: '0200000001' + 'ab'.repeat(40),
      privateKey: 'L' + 'x'.repeat(51),
      seed: 'cd'.repeat(32),
      mnemonic: 'abandon '.repeat(11) + 'about',
    };
    for (const [k, v] of Object.entries(secrets)) {
      const r = await h.req('GET', server.DEMO_ROUTE, { 'payment-proof': proofHeader(invoiceHash, txid, { [k]: v }) });
      assert.equal(r.status, 400, k); assert.equal(r.json.error, 'MALFORMED_PROOF');
      assert.equal(r.body.includes(v), false, `${k}: la respuesta no repite el valor`);
    }
    assert.equal(h.provider.calls, 0);
    assert.equal(h.grants.countGrants(), 0);
    await h.close();
  });
});

describe('PT-05: receipt sin verificación', () => {
  test('PT-05a: tx u outputs incrustados en la prueba -> 400; una prueba bien formada siempre consulta Chronik antes de 200', async () => {
    const h = await startApp();
    const { invoice, invoiceHash, txid, proof } = await paid(h);
    const fake = payingTx({ payTo: invoice.payTo, timeFirstSeen: h.clock.t });
    const outs = fake.outputs.map((o) => ({ ...o, sats: String(o.sats) }));
    for (const extra of [{ tx: { txid, outputs: outs, isFinal: true } }, { outputs: outs }, { isFinal: true }]) {
      const r = await h.req('GET', server.DEMO_ROUTE, { 'payment-proof': proofHeader(invoiceHash, txid, extra) });
      assert.equal(r.status, 400, Object.keys(extra)[0]); assert.equal(r.json.error, 'MALFORMED_PROOF');
    }
    assert.equal(h.provider.calls, 0);
    const ok = await h.req('GET', server.DEMO_ROUTE, { 'payment-proof': proof });
    assert.equal(ok.status, 200);
    assert.ok(h.provider.calls >= 1, 'el servidor verificó contra su Chronik (fixture)');
    await h.close();
  });
});

describe('PT-06: recurso bloqueado -> reconciliación sin segundo pago', () => {
  test('PT-06a: pago, reinicio OFF (503) y reactivación antes de expiresAt -> la misma prueba da 200 GRANTED, un grant, sin factura nueva', async () => {
    const h1 = await startApp();
    const { invoice, proof } = await paid(h1);
    await h1.close();
    const h2 = await startApp({ env: OFF_ENV, dir: h1.dir, start: h1.clock.t + 5 });
    assert.equal((await h2.req('GET', server.DEMO_ROUTE, { 'payment-proof': proof })).status, 503);
    await h2.close();
    const h3 = await startApp({ dir: h1.dir, start: invoice.expiresAt - 1 });
    h3.provider.set(JSON.parse(Buffer.from(proof, 'base64url')).txid, { ...payingTx({ payTo: invoice.payTo, timeFirstSeen: h3.clock.t }), txid: JSON.parse(Buffer.from(proof, 'base64url')).txid });
    const next = await h3.store.getNextDerivationIndex();
    const r = await h3.req('GET', server.DEMO_ROUTE, { 'payment-proof': proof });
    assert.equal(r.status, 200); assert.equal(r.json.status, 'GRANTED');
    assert.equal(h3.grants.countGrants(), 1);
    assert.equal(await h3.store.getNextDerivationIndex(), next, 'no se emitió una factura nueva (ningún segundo pago)');
    await h3.close();
  });
  test('PT-06b: reactivación tras expiresAt -> 402 INVOICE_EXPIRED, LATE_PAYMENT_REVIEW (reembolso manual), 0 grants', async () => {
    const h1 = await startApp();
    const { invoice, invoiceHash, proof } = await paid(h1);
    await h1.close();
    const h3 = await startApp({ dir: h1.dir, start: invoice.expiresAt + 1 });
    const txid = JSON.parse(Buffer.from(proof, 'base64url')).txid;
    h3.provider.set(txid, { ...payingTx({ payTo: invoice.payTo, timeFirstSeen: invoice.expiresAt - 10 }), txid });
    const r = await h3.req('GET', server.DEMO_ROUTE, { 'payment-proof': proof });
    assert.equal(r.status, 402); assert.equal(r.json.error, 'INVOICE_EXPIRED');
    const reader = new ReadOnlyStoreReader(path.join(h1.dir, 'store.sqlite'));
    assert.deepEqual(await h3.grants.reviewLatePayments(reader.listExpiredIssued(h3.clock.t), { hasFunds: (p) => p === invoice.payTo }), [invoiceHash]);
    assert.equal(h3.grants.latePaymentState(invoiceHash), 'LATE_PAYMENT_REVIEW');
    assert.equal(h3.grants.countGrants(), 0);
    reader.close();
    await h3.close();
  });
});

describe('PT-07: presupuesto y comisiones con límites cero', () => {
  test('PT-07a: presupuesto simulado con ZERO_LIMITS reales -> toda reserva >= 1 sat (acumulada o con comisión) se rechaza', () => {
    assert.equal(ZERO_LIMITS.maxAmountPerOperationSats, 0n);
    assert.equal(ZERO_LIMITS.maxAggregateSats, 0n);
    assert.equal(ZERO_LIMITS.agentBudgetSats, 0n);
    const b = simulatedBudget(ZERO_LIMITS);
    for (const [amount, fee] of [[1n, 0n], [0n, 1n], [546n, 200n], [1000n, 0n]]) assert.equal(b.reserve(amount, fee).ok, false);
    for (let i = 0; i < 5; i++) assert.equal(b.reserve(1n, 1n).ok, false, 'acumulado');
    assert.equal(b.reserved, 0n);
    assert.throws(() => { ZERO_LIMITS.maxAggregateSats = 1n; }, TypeError, 'ZERO_LIMITS congelado');
  });
  test('PT-07a: limitsZero = true en el health con OFF, ON sin adaptadores y ON con adaptadores', async () => {
    for (const [env, withAdapters] of [[OFF_ENV, true], [ON_ENV, false], [ON_ENV, true]]) {
      const h = await startApp({ env, withAdapters });
      const r = await h.req('GET', server.HEALTH_ROUTE);
      assert.equal(r.status, 200); assert.equal(r.json.limitsZero, true);
      await h.close();
    }
  });
});
