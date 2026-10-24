// PR-5b / M4-S (Fernando, 2026-10-24 08:03 CDMX; RQ-13 de INF-045 §4; INF-044 §10.1 M4; INF-045 §6.3
// fila M4-S: «Cadena oferta -> prueba -> 200; rechazo de PAYMENT-SIGNATURE y H2A v2»).
// Cliente C3B sintético (test/fixtures/x402/c3b-client.mjs) contra el proceso x402 en proceso
// (createApp con adaptadores inyectados y Chronik por fixtures, DEC-AX-09 (a)). Solo loopback
// 127.0.0.1; sin red, sin llaves, sin firma, sin fondos, sin broadcast. Sin cambios en src/.
// Cierra PT-01 (parcial hasta PR-5b en la tabla PT v1.1).
import assert from 'node:assert/strict';
import { request } from 'node:http';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import express from 'express';
import { createX402XecMiddleware } from '@x402-xec/express';
import { XpubPayToAllocator, computeInvoiceHash, canonicalize } from '@x402-xec/core';
import { AMOUNT, ORIGIN, TEST_XPUB, nextTxid, payingTx, proofHeader } from './fixtures/x402/chronik-fixtures.mjs';
import { C3BClientRejection, FORBIDDEN_CLIENT_HEADERS, SyntheticC3BClient, SyntheticWallet, acceptOffer, encodeProof } from './fixtures/x402/c3b-client.mjs';
import { ON_ENV, server, startApp as startHarness } from './pr4-harness.mjs';
import { PACKAGE_ROOT } from './helpers.mjs';
import { pathToFileURL } from 'node:url';

const { ReadOnlyStoreReader } = await import(pathToFileURL(path.join(PACKAGE_ROOT, 'dist', 'store-reader.js')).href);
const opened = [];
const startApp = async (o) => { const h = await startHarness(o); opened.push(h); return h; };
const closers = [];
after(async () => { for (const h of opened) { try { await h.close(); } catch {} } for (const c of closers) { try { await c(); } catch {} } });

const ROUTE = server.DEMO_ROUTE;
// payTo watch-only derivado del xpub público de prueba (índice alto, fuera de los que emite el harness).
const FOREIGN_PAY_TO = new XpubPayToAllocator(TEST_XPUB).deriveAddress(9999);
const clientFor = (h, walletOpts) => {
  const wallet = new SyntheticWallet(h.provider, { now: () => h.clock.t, ...walletOpts });
  const client = new SyntheticC3BClient({ send: h.req, wallet, publicOrigin: ORIGIN, now: () => h.clock.t });
  return { wallet, client };
};
const paidInvoices = (h) => {
  const r = new ReadOnlyStoreReader(path.join(h.dir, 'store.sqlite'));
  try { return [...r.listPaid()]; } finally { r.close(); }
};
const assertNoEconomicEffect = (h, { chronikCalls = 0 } = {}) => {
  assert.equal(h.grants.countGrants(), 0, 'sin grant');
  assert.equal(paidInvoices(h).length, 0, 'ninguna factura PAID');
  assert.equal(h.provider.calls, chronikCalls, 'consultas a la Chronik (fixture)');
};

/** Servidor H2A v2 / C1 REAL de x402-XEC 0f409de (createX402XecMiddleware): oferta con
 * scheme xec-prepaid-utxo y paymentHeader PAYMENT-SIGNATURE. Solo genera el 402; su fetch es un
 * stub que falla (sin red) y nunca se alcanza porque el cliente no envía PAYMENT-SIGNATURE. */
async function startForeignH2A() {
  let fetchCalls = 0;
  const app = express();
  app.get('/x402/v1/access/demo', createX402XecMiddleware({
    publicOrigin: ORIGIN, facilitatorUrl: 'https://facilitator.invalid', payTo: FOREIGN_PAY_TO,
    routes: { 'GET /x402/v1/access/demo': { amountSats: AMOUNT, asset: 'XEC', network: 'xec:mainnet', scheme: 'xec-prepaid-utxo' } },
    now: () => 1_791_400_000,
    fetch: async () => { fetchCalls += 1; throw new Error('sin red'); },
  }), (_req, res) => res.json({ ok: true }));
  const srv = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  closers.push(() => new Promise((res) => srv.close(res)));
  const send = (method, p, headers = {}) => new Promise((resolve, reject) => {
    const r = request({ host: '127.0.0.1', port: srv.address().port, method, path: p, headers, agent: false }, (res) => {
      let body = ''; res.setEncoding('utf8'); res.on('data', (c) => { body += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(body); } catch {} resolve({ status: res.statusCode, headers: res.headers, body, json }); });
    });
    r.on('error', reject); r.end();
  });
  return { send, fetchCalls: () => fetchCalls };
}

describe('M4-S 1: cadena C3B oferta -> recibo -> prueba -> 200 (INF-045 §6.3; INF-042 §9.1)', () => {
  test('el cliente sintético obtiene 200 GRANTED con una sola factura, un pago y una consulta a Chronik', async () => {
    const h = await startApp();
    const { wallet, client } = clientFor(h);
    const r = await client.access(ROUTE);
    assert.equal(r.first.status, 402);
    assert.equal(r.first.headers['payment-required'], 'true');
    assert.equal(r.offer.x402Version, 1);
    assert.deepEqual([r.offer.accepts.length, r.offer.accepts[0].scheme, r.offer.accepts[0].network, r.offer.accepts[0].proofHeader], [1, 'exact', 'xec:mainnet', 'payment-proof']);
    assert.equal(r.invoiceHash, computeInvoiceHash(r.offer.invoice));
    assert.deepEqual(r.proof, { x402Version: 1, network: 'xec:mainnet', invoiceHash: r.invoiceHash, txid: r.receipt.txid });
    assert.equal(r.second.status, 200, r.second.body);
    assert.equal(r.second.json.status, 'GRANTED');
    assert.equal(wallet.calls, 1);
    assert.equal(h.provider.calls, 1, 'el servidor verificó contra SU Chronik (fixture)');
    assert.equal(h.grants.countGrants(), 1);
    assert.deepEqual(paidInvoices(h).map((p) => p.invoiceHash), [r.invoiceHash]);
  });
  test('reintento con la misma prueba -> 200 EFFECT_REPLAYED, mismo grant, sin nuevo pago (DEC-AX-04)', async () => {
    const h = await startApp();
    const { wallet, client } = clientFor(h);
    const r = await client.access(ROUTE);
    const again = await client.redeliver(ROUTE, r.proofHeader);
    assert.equal(again.status, 200);
    assert.equal(again.json.status, 'EFFECT_REPLAYED');
    assert.equal(again.json.grantId, r.second.json.grantId);
    assert.equal(again.json.deliveryCount, 1);
    assert.equal(wallet.calls, 1);
    assert.equal(h.grants.countGrants(), 1);
  });
  test('la prueba del cliente va en base64url canónico, sin firma, vout, rawTx ni llaves (INF-042 §6.3)', async () => {
    const h = await startApp();
    const { client } = clientFor(h);
    const r = await client.access(ROUTE);
    assert.match(r.proofHeader, /^[A-Za-z0-9_-]+$/);
    assert.equal(Buffer.from(r.proofHeader, 'base64url').toString('utf8'), canonicalize(r.proof));
    assert.deepEqual(Object.keys(r.proof).sort(), ['invoiceHash', 'network', 'txid', 'x402Version']);
  });
  test('el cliente nunca emite PAYMENT-SIGNATURE, X-PAYMENT ni alias de prueba', async () => {
    const h = await startApp();
    const { client } = clientFor(h);
    await client.access(ROUTE);
    const names = client.sent.flatMap((s) => Object.keys(s.headers).map((k) => k.toLowerCase()));
    assert.deepEqual(names, ['payment-proof']);
    for (const f of FORBIDDEN_CLIENT_HEADERS) assert.ok(!names.includes(f), f);
  });
  test('par negativo: si el wallet sintético paga un importe menor, el servidor no concede (402 AMOUNT_MISMATCH)', async () => {
    const h = await startApp();
    const { client } = clientFor(h, { txOpts: { sats: BigInt(AMOUNT) - 1n } });
    const r = await client.access(ROUTE);
    assert.equal(r.second.status, 402, r.second.body);
    assert.equal(r.second.json.error, 'AMOUNT_MISMATCH');
    assert.equal(h.grants.countGrants(), 0);
  });
  test('par negativo: tx no final -> 402 TRANSACTION_NOT_FINAL, sin grant', async () => {
    const h = await startApp();
    const { client } = clientFor(h, { txOpts: { isFinal: false } });
    const r = await client.access(ROUTE);
    assert.equal(r.second.status, 402);
    assert.equal(r.second.json.error, 'TRANSACTION_NOT_FINAL');
    assert.equal(h.grants.countGrants(), 0);
  });
});

describe('M4-S 2: el cliente RECHAZA PAYMENT-SIGNATURE y H2A v2 (INF-044 §10.1 M4; INF-042 §5, G-05)', () => {
  test('oferta REAL H2A v2 / C1 de x402-XEC 0f409de (xec-prepaid-utxo, paymentHeader PAYMENT-SIGNATURE) -> rechazo, sin pago y sin segunda petición', async () => {
    const f = await startForeignH2A();
    const provider = { set() { throw new Error('no debe pagar'); } };
    const wallet = new SyntheticWallet(provider, { now: () => 1_791_400_000 });
    const client = new SyntheticC3BClient({ send: f.send, wallet, publicOrigin: ORIGIN, now: () => 1_791_400_000 });
    const first = await f.send('GET', ROUTE);
    assert.equal(first.status, 402);
    assert.equal(first.json.accepts[0].paymentHeader, 'PAYMENT-SIGNATURE');
    assert.equal(first.json.accepts[0].scheme, 'xec-prepaid-utxo');
    await assert.rejects(client.access(ROUTE), (e) => e instanceof C3BClientRejection && e.code === 'PAYMENT_SIGNATURE_OFFER');
    assert.equal(wallet.calls, 0, 'no pagó');
    assert.equal(client.sent.length, 1, 'no hubo segunda petición');
    assert.deepEqual(client.sent[0].headers, {}, 'no envió PAYMENT-SIGNATURE');
    assert.equal(f.fetchCalls(), 0, 'el facilitador nunca se contactó');
  });
  // Mutaciones de un 402 C3B real: cada una debe rechazarse sin pagar.
  const MUTATIONS = {
    'paymentHeader PAYMENT-SIGNATURE en accepts[0]': ['PAYMENT_SIGNATURE_OFFER', (r) => { r.json.accepts[0].paymentHeader = 'PAYMENT-SIGNATURE'; }],
    'cabecera PAYMENT-SIGNATURE en la respuesta': ['PAYMENT_SIGNATURE_OFFER', (r) => { r.headers['payment-signature'] = 'x'; }],
    'H2A v2: x402Version 2 en el cuerpo': ['H2A_V2_OFFER', (r) => { r.json.x402Version = 2; }],
    'H2A v2: scheme xec-prepaid-utxo': ['H2A_V2_OFFER', (r) => { r.json.accepts[0].scheme = 'xec-prepaid-utxo'; }],
    'sin x-x402-payment-offer (x402 genérico PAYMENT-REQUIRED)': ['NOT_C3B_OFFER', (r) => { delete r.headers['x-x402-payment-offer']; }],
    'sin payment-required: true': ['NOT_C3B_OFFER', (r) => { delete r.headers['payment-required']; }],
    'cabecera de oferta no canónica (padding)': ['MALFORMED_OFFER', (r) => { r.headers['x-x402-payment-offer'] += '='; }],
    'cuerpo con otra factura que la cabecera': ['OFFER_BODY_MISMATCH', (r) => { r.json.invoiceId = 'f'.repeat(64); }],
    'factura para otro recurso (resourceHash)': ['RESOURCE_MISMATCH', null],
    'oferta vencida': ['OFFER_EXPIRED', null],
    'estado 503 (kill switch)': ['NOT_402', (r) => { r.status = 503; }],
  };
  for (const [label, [code, mutate]] of Object.entries(MUTATIONS)) {
    test(`oferta mutada: ${label} -> rechazo ${code}, sin pago`, async () => {
      const h = await startApp();
      const real = await h.req('GET', ROUTE);
      assert.equal(acceptOffer(real, { publicOrigin: ORIGIN, method: 'GET', path: ROUTE, now: h.clock.t }).invoiceHash, real.json.invoiceId, 'par positivo: el 402 real se acepta');
      const r = structuredClone({ status: real.status, headers: real.headers, json: real.json });
      if (mutate) mutate(r);
      const expect = { publicOrigin: ORIGIN, method: 'GET', path: label.startsWith('factura para otro') ? '/x402/v1/access/demo-alt' : ROUTE, now: label === 'oferta vencida' ? r.json.invoice.expiresAt : h.clock.t };
      assert.throws(() => acceptOffer(r, expect), (e) => e instanceof C3BClientRejection && e.code === code);
      assertNoEconomicEffect(h);
    });
  }
  test('kill switch OFF: el cliente recibe 503, rechaza NOT_402 y no paga; sin factura ni grant', async () => {
    const h = await startApp({ env: { NODE_ENV: 'test' } });
    const { wallet, client } = clientFor(h);
    await assert.rejects(client.access(ROUTE), (e) => e.code === 'NOT_402');
    assert.equal(wallet.calls, 0);
    assertNoEconomicEffect(h);
  });
  test('ON sin adaptadores (proceso real, E-8): 503 TEYOLIA_X402_NOT_IMPLEMENTED; el cliente no paga', async () => {
    const h = await startApp({ env: ON_ENV, withAdapters: false });
    const { wallet, client } = clientFor(h);
    await assert.rejects(client.access(ROUTE), (e) => e.code === 'NOT_402');
    assert.equal(wallet.calls, 0);
  });
});

describe('M4-S 3: el servidor nunca acepta PAYMENT-SIGNATURE ni H2A v2 como pago (aserción explícita)', () => {
  const c1Envelope = (invoice) => Buffer.from(JSON.stringify({ x402Version: 1, scheme: 'xec-prepaid-utxo', network: 'xec:mainnet', payload: { authorization: { invoice }, signature: 'ab'.repeat(32) } })).toString('base64url');
  test('PAYMENT-SIGNATURE con un sobre C1 para la factura emitida -> 402 con oferta C3B nueva; sin grant, sin PAID, 0 Chronik', async () => {
    const h = await startApp();
    const first = await h.req('GET', ROUTE);
    const r = await h.req('GET', ROUTE, { 'payment-signature': c1Envelope(first.json.invoice) });
    assert.equal(r.status, 402);
    assert.equal(r.headers['payment-required'], 'true');
    assert.notEqual(r.json.invoiceId, first.json.invoiceId, 'factura nueva: la cabecera no se interpreta');
    assert.equal(r.json.accepts[0].proofHeader, 'payment-proof');
    assertNoEconomicEffect(h);
  });
  test('PAYMENT-SIGNATURE que transporta una prueba C3B VÁLIDA de una tx pagada -> 402; el servidor no lee pruebas de esa cabecera', async () => {
    const h = await startApp();
    const { wallet } = clientFor(h);
    const first = await h.req('GET', ROUTE);
    const receipt = wallet.settle({ payTo: first.json.invoice.payTo, amountSats: first.json.invoice.amountSats });
    const valid = encodeProof({ x402Version: 1, network: 'xec:mainnet', invoiceHash: first.json.invoiceId, txid: receipt.txid });
    const r = await h.req('GET', ROUTE, { 'payment-signature': valid });
    assert.equal(r.status, 402);
    assertNoEconomicEffect(h);
    // Par positivo: la MISMA prueba en payment-proof concede.
    const ok = await h.req('GET', ROUTE, { 'payment-proof': valid });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'GRANTED');
  });
  test('H2A v2: prueba con x402Version 2 en payment-proof -> 400 MALFORMED_PROOF; sin grant, sin PAID, 0 Chronik', async () => {
    const h = await startApp();
    const first = await h.req('GET', ROUTE);
    const txid = nextTxid();
    h.provider.set(txid, { ...payingTx({ payTo: first.json.invoice.payTo, timeFirstSeen: h.clock.t }), txid });
    const r = await h.req('GET', ROUTE, { 'payment-proof': proofHeader(first.json.invoiceId, txid, { x402Version: 2 }) });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'MALFORMED_PROOF');
    assertNoEconomicEffect(h);
  });
  test('H2A v2: prueba con scheme xec-prepaid-utxo y firma -> 400 MALFORMED_PROOF; sin efectos', async () => {
    const h = await startApp();
    const first = await h.req('GET', ROUTE);
    const txid = nextTxid();
    h.provider.set(txid, { ...payingTx({ payTo: first.json.invoice.payTo, timeFirstSeen: h.clock.t }), txid });
    const r = await h.req('GET', ROUTE, { 'payment-proof': proofHeader(first.json.invoiceId, txid, { scheme: 'xec-prepaid-utxo', signature: 'ab'.repeat(32) }) });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'MALFORMED_PROOF');
    assertNoEconomicEffect(h);
  });
});
