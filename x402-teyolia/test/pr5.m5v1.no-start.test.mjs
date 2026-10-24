// M5-V1, opción B (Fernando, 2026-10-23 17:39 CDMX; Auditor P5-01): sin identidad de build válida
// el proceso real NO arranca. startServer evalúa loadBuildIdentity() ANTES de openPersistence() y
// sale con 78 sin abrir, crear ni modificar store.sqlite, grant.sqlite ni sus -wal/-shm.
// Proceso hijo real (`node dist/main.js` desde una copia de dist/), con el kill switch ON y rutas de
// persistencia en un directorio propio: si la persistencia se abriera, ese directorio dejaría de
// estar vacío. Control negativo: en 0471c85 (y en f23146f) estos casos arrancan.
import assert from 'node:assert/strict';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { CODEGEN_FLAG, PACKAGE_ROOT, baselineEnv, http, launch, makeTmp } from './helpers.mjs';

const DIST = path.join(PACKAGE_ROOT, 'dist');
const realInfo = JSON.parse(readFileSync(path.join(DIST, 'build-info.json'), 'utf8'));
// Dentro del paquete para que la copia resuelva node_modules (mismo patrón que pr5.m5v1 D).
const base = mkdtempSync(path.join(PACKAGE_ROOT, '.m5v1-tmp-'));
after(() => rmSync(base, { recursive: true, force: true }));
let n = 0;
const copyDist = () => { const d = path.join(base, `d${n++}`, 'dist'); cpSync(DIST, d, { recursive: true }); return d; };
const writeInfo = (d, v) => writeFileSync(path.join(d, 'build-info.json'), typeof v === 'string' ? v : JSON.stringify(v));

const CASES = {
  // (1) ausente
  'ausente: sin build-info.json': (d) => unlinkSync(path.join(d, 'build-info.json')),
  // (2) JSON inválido
  'JSON inválido: «{»': (d) => writeInfo(d, '{'),
  'JSON inválido: vacío': (d) => writeInfo(d, ''),
  // (3) estructuralmente no verificable
  'no verificable: commit null': (d) => writeInfo(d, { ...realInfo, commit: null }),
  'no verificable: commit de 39 hex': (d) => writeInfo(d, { ...realInfo, commit: realInfo.commit.slice(1) }),
  'no verificable: commit en mayúsculas': (d) => writeInfo(d, { ...realInfo, commit: realInfo.commit.toUpperCase() }),
  'no verificable: distManifestSha256 de 63 hex': (d) => writeInfo(d, { ...realInfo, distManifestSha256: realInfo.distManifestSha256.slice(1) }),
  'no verificable: distManifestSha256 null': (d) => writeInfo(d, { ...realInfo, distManifestSha256: null }),
  'no verificable: clave extra': (d) => writeInfo(d, { ...realInfo, dirty: false }),
  'no verificable: falta files': (d) => { const { files, ...j } = realInfo; writeInfo(d, j); },
  'no verificable: schema 2': (d) => writeInfo(d, { ...realInfo, schema: 2 }),
  'no verificable: files 0': (d) => writeInfo(d, { ...realInfo, files: 0 }),
  'no verificable: array': (d) => writeInfo(d, [realInfo]),
};

async function run(mutate, { on = true } = {}) {
  const d = copyDist();
  mutate(d);
  const home = makeTmp('x402-nostart-h-').dir;
  const data = makeTmp('x402-nostart-d-').dir;
  const cwd = makeTmp('x402-nostart-c-').dir;
  const env = { ...baselineEnv(home), ...(on ? { TEYOLIA_X402_ENABLED: 'true' } : {}),
    TEYOLIA_X402_STORE_PATH: path.join(data, 'store.sqlite'), TEYOLIA_X402_GRANT_DB_PATH: path.join(data, 'grant.sqlite') };
  const r = await launch({ env, cwd, main: path.join(d, 'main.js'), execArgv: [CODEGEN_FLAG] });
  return { r, data, home, cwd };
}

describe('M5-V1 opción B: identidad de build no válida -> exit 78 antes de cualquier persistencia', () => {
  for (const [label, mutate] of Object.entries(CASES)) {
    for (const on of [true, false]) {
      test(`${label} (${on ? 'ON' : 'OFF'}) -> exit 78; sin store.sqlite, grant.sqlite, -wal ni -shm; directorios vacíos`, async () => {
        const { r, data, home, cwd } = await run(mutate, { on });
        if (r.started) { await r.stop(); assert.fail(`arrancó con identidad no válida: ${label}`); }
        assert.equal(r.code, 78, r.stderr);
        assert.match(r.stderr, /identidad de build no válida \(.+\); arranque abortado/);
        assert.doesNotMatch(r.stdout, /escuchando/);
        assert.deepEqual(readdirSync(data), [], 'directorio de datos vacío: ni store, ni grant, ni -wal/-shm');
        assert.deepEqual(readdirSync(cwd), [], 'cwd vacío');
        assert.deepEqual(readdirSync(home), [], 'HOME vacío');
      });
    }
  }
  test('control positivo: copia exacta (ON) -> arranca, health 200 con la identidad; crea store y grant', async () => {
    const { r, data } = await run(() => {});
    assert.equal(r.started, true, r.stderr);
    try {
      const h = await http(r.port, 'GET', '/teyolia-x402/health');
      assert.equal(h.status, 200);
      assert.equal(h.json.commit, realInfo.commit);
      assert.equal(h.json.distManifestSha256, realInfo.distManifestSha256);
      assert.equal(h.json.limitsZero, true);
      assert.equal((await http(r.port, 'GET', '/x402/v1/access/demo')).status, 503, 'el proceso sigue en 503');
    } finally { await r.stop(); }
    assert.deepEqual(readdirSync(data).filter((f) => f.endsWith('.sqlite')).sort(), ['grant.sqlite', 'store.sqlite']);
  });
  test('control positivo: copia exacta (OFF) -> arranca y no crea ningún archivo (R-14)', async () => {
    const { r, data } = await run(() => {}, { on: false });
    assert.equal(r.started, true, r.stderr);
    await r.stop();
    assert.deepEqual(readdirSync(data), []);
  });
  test('residual declarado (PT5-04 (iv), recálculo no adoptado): un .js mutado con build-info intacto arranca', async () => {
    const { r } = await run((d) => appendFileSync(path.join(d, 'allowlist.js'), '\n'), { on: false });
    assert.equal(r.started, true, r.stderr);
    await r.stop();
  });
});
