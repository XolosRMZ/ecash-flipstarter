// P4-L3 (dictamen PR-4, opcional en PR-5; incluido): la configuración inválida se detecta ANTES de
// crear el primer archivo de persistencia. Control negativo: en f23146f el store (y con ON también
// la DB del grant) se creaban antes de rechazar proxy de confianza, expiración o reentregas.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { CODEGEN_FLAG, PACKAGE_ROOT, baselineEnv, launch, makeTmp } from './helpers.mjs';

const { openPersistence } = await import(pathToFileURL(path.join(PACKAGE_ROOT, 'dist', 'server.js')).href);
const paths = (d) => ({ TEYOLIA_X402_STORE_PATH: path.join(d, 's.sqlite'), TEYOLIA_X402_GRANT_DB_PATH: path.join(d, 'g.sqlite') });

describe('P4-L3: configuración inválida -> 78 sin crear archivos', () => {
  for (const [k, v] of [['TEYOLIA_X402_TRUST_PROXY', 'todos'], ['TEYOLIA_X402_EXPIRY_SECONDS', '0'], ['TEYOLIA_X402_EXPIRY_SECONDS', '3601'], ['TEYOLIA_X402_REDELIVERY_MAX', '-1'], ['TEYOLIA_X402_REDELIVERY_WINDOW_SECONDS', '0']]) {
    test(`proceso ON con ${k}=${v} -> exit 78 y el directorio de persistencia queda vacío`, async () => {
      const home = makeTmp('x402-p4l3h-').dir;
      const data = makeTmp('x402-p4l3d-').dir;
      const env = { ...baselineEnv(home), TEYOLIA_X402_ENABLED: 'true', ...paths(data), [k]: v };
      const r = await launch({ env, cwd: makeTmp('x402-cwd-').dir, execArgv: [CODEGEN_FLAG] });
      if (r.started) { await r.stop(); assert.fail('arrancó con configuración inválida'); }
      assert.equal(r.code, 78);
      assert.deepEqual(readdirSync(data), [], 'ningún archivo creado antes del rechazo');
    });
  }
  test('openPersistence con reentregas inválidas -> invalid sin crear el store', () => {
    const d = makeTmp('x402-p4l3o-').dir;
    assert.equal(openPersistence({ TEYOLIA_X402_ENABLED: 'true', ...paths(d), TEYOLIA_X402_REDELIVERY_MAX: 'diez' }), 'invalid');
    assert.deepEqual(readdirSync(d), []);
  });
  test('control positivo: configuración válida -> arranca y crea los dos archivos', async () => {
    const home = makeTmp('x402-p4l3h-').dir;
    const data = makeTmp('x402-p4l3d-').dir;
    const env = { ...baselineEnv(home), TEYOLIA_X402_ENABLED: 'true', ...paths(data), TEYOLIA_X402_TRUST_PROXY: 'loopback' };
    const r = await launch({ env, cwd: makeTmp('x402-cwd-').dir, execArgv: [CODEGEN_FLAG] });
    assert.equal(r.started, true, r.stderr);
    await r.stop();
    assert.deepEqual(readdirSync(data).filter((f) => f.endsWith('.sqlite')).sort(), ['g.sqlite', 's.sqlite']);
  });
});
