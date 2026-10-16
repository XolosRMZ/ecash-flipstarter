// C5 de PR-2b (INF-042 §11.7): D-01 (exportaciones) y F-01 (framing) sobre los tarballs
// vendorizados, como harness en test/ sin tocar src/. T-09 queda en PR-4 (dictamen PR-2 (e)).
// Procesos hijos con env explícito y cwd temporal; red solo loopback.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { FIXTURES } from './helpers.mjs';

const VECTOR = '7975d9022ee66b131c0ca3fae24ce5b7ddde46f56ac2e3a78e73720649770854'; // INF-042 §11.5
const EXPRESS4_FRAMING = 'b8cf668ca3266322e05e300a15cc8fc926da2908a96dcc2a04fbfe2082c335be'; // body {} (Auditor)
const CWD = mkdtempSync(path.join(tmpdir(), 'x402-f01-'));
process.on('exit', () => rmSync(CWD, { recursive: true, force: true }));

function harness(mode, nodeEnv = 'test') {
  const env = { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', ...(nodeEnv === null ? {} : { NODE_ENV: nodeEnv }) };
  const r = spawnSync(process.execPath, ['--no-warnings', path.join(FIXTURES, 'x402', 'f01-app.mjs'), mode], { env, cwd: CWD, encoding: 'utf8', timeout: 20000 });
  const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('F01 '));
  assert.ok(line, `sin salida del harness (status ${r.status}): ${r.stderr}`);
  return JSON.parse(line.slice(4));
}

describe('D-01 exportaciones de la superficie vendorizada', () => {
  test('@x402-xec/express exporta createX402SettlementMiddleware; @x402-xec/core/sqlite exporta los stores', async () => {
    const ex = await import('@x402-xec/express');
    const sq = await import('@x402-xec/core/sqlite');
    const core = await import('@x402-xec/core');
    assert.equal(typeof ex.createX402SettlementMiddleware, 'function');
    for (const k of ['SqliteAuthoritativeInvoiceStore', 'InMemorySqliteAuthoritativeInvoiceStore', 'BaseSqliteAuthoritativeInvoiceStore']) assert.equal(typeof sq[k], 'function', k);
    for (const k of ['computeResourceHash', 'computeInvoiceHash', 'InMemoryAuthoritativeInvoiceStore', 'XpubPayToAllocator']) assert.equal(typeof core[k], 'function', k);
  });
});

describe('F-01 GET sin cuerpo en la ruta x402 (Express 5, sin body-parser)', () => {
  test('positivo: 402 con resourceHash = vector §11.5 (y = computeResourceHash del core vendorizado)', () => {
    const r = harness('plain');
    assert.equal(r.status, 402);
    assert.equal(r.vectorFromCore, VECTOR);
    assert.equal(r.resourceHash, VECTOR);
    assert.deepEqual(r.resource, { serverOrigin: 'https://api.teyolia.cash', method: 'GET', path: '/x402/v1/access/demo' });
  });
  test('negativo: framing de Express 4 (req.body = {}) -> el hash cambia a b8cf…35be y no coincide con el vector', () => {
    const r = harness('empty-object');
    assert.equal(r.status, 402);
    assert.equal(r.resourceHash, EXPRESS4_FRAMING);
    assert.notEqual(r.resourceHash, VECTOR);
  });
  test('express.json() de Express 5 delante: se registra el hash observado (detección de cambio de framing)', () => {
    const r = harness('json');
    assert.equal(r.status, 402);
    // Express 5 / body-parser 2 no crea req.body en un GET sin cuerpo: el hash se conserva.
    // Si una versión futura lo cambiara, este test falla y obliga a revisar F-01.
    assert.equal(r.resourceHash, VECTOR);
  });
  test('(anticipa P2-I4, PR-6) NODE_ENV ausente o production: el modo inseguro se rechaza al crear el middleware', () => {
    for (const nodeEnv of [null, 'production']) {
      const r = harness('prod', nodeEnv);
      assert.match(r.createError ?? '', /durable authoritative store/);
    }
  });
});
