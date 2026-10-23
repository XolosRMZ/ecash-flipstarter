// P4-L1 (PR-4; PR-5): los valores de Q-09 son el tope de la configuración de reentregas.
// TEYOLIA_X402_REDELIVERY_MAX <= 10 y TEYOLIA_X402_REDELIVERY_WINDOW_SECONDS <= 86400; por encima,
// fail-closed (openPersistence -> 'invalid', proceso -> exit 78; GrantDb -> RangeError).
// Control negativo: en f23146f los valores 11 y 86401 se aceptaban.
import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { CODEGEN_FLAG, PACKAGE_ROOT, baselineEnv, launch, makeTmp } from './helpers.mjs';

const dist = (f) => pathToFileURL(path.join(PACKAGE_ROOT, 'dist', f)).href;
const { openPersistence, readRedeliveryOptions } = await import(dist('server.js'));
const { GrantDb } = await import(dist('grant-db.js'));
const { PersistenceConfigError } = await import(dist('persistence-config.js'));
const paths = (d) => ({ TEYOLIA_X402_STORE_PATH: path.join(d, 's.sqlite'), TEYOLIA_X402_GRANT_DB_PATH: path.join(d, 'g.sqlite') });

describe('P4-L1 (PR-4): tope de la configuración de reentregas = Q-09', () => {
  for (const [k, v, ok] of [
    ['TEYOLIA_X402_REDELIVERY_MAX', '10', true], ['TEYOLIA_X402_REDELIVERY_MAX', '0', true], ['TEYOLIA_X402_REDELIVERY_MAX', '11', false], ['TEYOLIA_X402_REDELIVERY_MAX', '999999999', false],
    ['TEYOLIA_X402_REDELIVERY_WINDOW_SECONDS', '86400', true], ['TEYOLIA_X402_REDELIVERY_WINDOW_SECONDS', '1', true], ['TEYOLIA_X402_REDELIVERY_WINDOW_SECONDS', '86401', false], ['TEYOLIA_X402_REDELIVERY_WINDOW_SECONDS', '604800', false],
  ]) {
    test(`${k}=${v} -> ${ok ? 'aceptado' : 'rechazado (fail-closed)'}`, () => {
      if (ok) assert.equal(readRedeliveryOptions({ [k]: v })[k.endsWith('MAX') ? 'redeliveryMax' : 'redeliveryWindowSeconds'], Number(v));
      else assert.throws(() => readRedeliveryOptions({ [k]: v }), PersistenceConfigError);
      const d = makeTmp('x402-p4l1-').dir;
      const p = openPersistence({ TEYOLIA_X402_ENABLED: 'true', ...paths(d), [k]: v });
      if (ok) { assert.ok(p && p !== 'invalid'); p.grants.shutdown(); p.store.shutdown(); }
      else assert.equal(p, 'invalid');
    });
  }
  test('GrantDb: redeliveryMax > 10 o ventana > 86400 -> RangeError; los topes exactos se aceptan', () => {
    const d = makeTmp('x402-p4l1g-').dir;
    for (const o of [{ redeliveryMax: 11 }, { redeliveryWindowSeconds: 86_401 }]) assert.throws(() => new GrantDb(path.join(d, `g${Math.random()}.sqlite`), o), RangeError);
    const g = new GrantDb(path.join(d, 'ok.sqlite'), { redeliveryMax: 10, redeliveryWindowSeconds: 86_400 });
    g.shutdown();
  });
  test('proceso: ON con TEYOLIA_X402_REDELIVERY_MAX=11 -> no arranca (78)', async () => {
    const home = makeTmp('x402-p4l1h-').dir;
    const env = { ...baselineEnv(home), TEYOLIA_X402_ENABLED: 'true', ...paths(home), TEYOLIA_X402_REDELIVERY_MAX: '11' };
    const r = await launch({ env, cwd: makeTmp('x402-cwd-').dir, execArgv: [CODEGEN_FLAG] });
    if (r.started) { await r.stop(); assert.fail('arrancó con un tope por encima de Q-09'); }
    assert.equal(r.code, 78);
    assert.match(r.stderr, /TEYOLIA_X402_REDELIVERY_MAX/);
  });
});
