// Harness de F-01 (PR-2b C5; INF-042 §11.5 y §11.7). Solo test/: no toca src/ ni server.ts.
// App Express 5 de prueba en 127.0.0.1:0 con el middleware vendorizado, store en memoria y
// txProvider sintético (DEC-AX-09 (a)); payTo sintético = hash160 de ceros (sin llave, sin fondos).
// Modo (argv[2]): plain | json | empty-object | prod. Escribe una línea `F01 {…}` y termina.
import express from 'express';
import ecashaddr from 'ecashaddrjs';
import { InMemoryAuthoritativeInvoiceStore, computeResourceHash } from '@x402-xec/core';
import { createX402SettlementMiddleware } from '@x402-xec/express';

const mode = process.argv[2] ?? 'plain';
const out = (o) => process.stdout.write(`F01 ${JSON.stringify(o)}\n`);
const payTo = ecashaddr.encodeCashAddress('ecash', 'p2pkh', '00'.repeat(20));
const txProvider = { async getTx() { throw new Error('txProvider sintético: no debe consultarse en F-01'); } };
let mw;
try {
  mw = createX402SettlementMiddleware({
    publicOrigin: 'https://api.teyolia.cash',
    payTo,
    routes: { 'GET /x402/v1/access/demo': { amountSats: '1000' } },
    store: new InMemoryAuthoritativeInvoiceStore(),
    txProvider,
    allowInsecureDevelopmentMode: true,
  });
} catch (err) {
  out({ mode, nodeEnv: process.env.NODE_ENV ?? null, createError: String(err?.message ?? err) });
  process.exit(0);
}
const app = express();
if (mode === 'json') app.use(express.json());
// Emula el framing de Express 4 + express.json() global (req.body = {} en un GET sin cuerpo).
if (mode === 'empty-object') app.use((req, _res, next) => { req.body = {}; next(); });
app.use(mw);
app.get('/x402/v1/access/demo', (_req, res) => res.json({ ok: true }));
const server = app.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  const r = await fetch(`http://127.0.0.1:${port}/x402/v1/access/demo`);
  const body = await r.json();
  out({
    mode,
    status: r.status,
    resourceHash: body.invoice?.resourceHash ?? null,
    resource: body.resource ?? null,
    vectorFromCore: computeResourceHash({ serverOrigin: 'https://api.teyolia.cash', method: 'GET', path: '/x402/v1/access/demo' }),
    offerHeader: r.headers.has('x402-payment-offer') || r.headers.has('payment-offer') || [...r.headers.keys()].some((k) => k.includes('offer')),
  });
  server.close();
});
