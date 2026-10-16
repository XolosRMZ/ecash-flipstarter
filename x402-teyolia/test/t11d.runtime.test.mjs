// T-11d (PR-2 commit 1; propuesta T-11a §4.1.3 y dictamen del Auditor §4.1, L1P-L2, L1P-L4).
// Vector de IMPLEMENTACIÓN, no normativo hasta INF-045 v1.2 ratificada.
// Copia real del paquete bajo un padre envenenado: canarios en dos ancestros
// (<tmp>/outer/node_modules y <tmp>/node_modules) y en $HOME/.node_modules y
// $HOME/.node_libraries (HOME=<tmp>/home). Arranca la sonda con env explícito
// (sin TEYOLIA_X402_ENABLED: DEC-AX-08 (a)), cwd temporal sin .env, sin red.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { FIXTURES, PACKAGE_ROOT } from './helpers.mjs';
import { SURFACES, buildGraph, lockfileClosure } from '../scripts/check-graph.mjs';

const LOCK = lockfileClosure(path.join(PACKAGE_ROOT, 'package-lock.json'));
const GRAPH = buildGraph(path.join(PACKAGE_ROOT, 'dist', 'main.js'));
// PR-2b C4: también la superficie vendorizada (ESM), para canarios y para el cruce estático/runtime.
const VENDOR_GRAPH = buildGraph(path.join(PACKAGE_ROOT, SURFACES.vendor), { surface: 'vendor' });
const STATIC_FILES = new Set([...GRAPH.nodes.keys(), ...VENDOR_GRAPH.nodes.keys()].map((f) => path.relative(PACKAGE_ROOT, f)));
// Nombres de canario calculados (no a mano): especificadores literales alcanzables fuera del
// lockfile (de buildGraph) + supports-color + has-flag + todo el cierre de producción.
const CANARY_NAMES = [...new Set([...GRAPH.externalSpecs, ...VENDOR_GRAPH.externalSpecs, 'supports-color', 'has-flag', ...LOCK.names])].sort();

const ROOT_TMP = mkdtempSync(path.join(tmpdir(), 'x402-t11d-'));
process.on('exit', () => rmSync(ROOT_TMP, { recursive: true, force: true }));

// Precondición P2-L8 (dictamen del Auditor, Plan PR-2): los negativos d-n1..d-n3 atribuyen cada
// marcador a un canario de este árbol. Eso solo vale si ningún ancestro del sistema (fuera del
// árbol de prueba) tiene un node_modules: en particular, /node_modules no debe existir.
// Fail-closed: si existe cualquiera, T-11d falla entero (no se omite ni se relaja).
const SYSTEM_ANCESTOR_NODE_MODULES = (() => {
  const found = [];
  let dir = path.dirname(realpathSync(ROOT_TMP));
  for (;;) {
    const nm = path.join(dir, 'node_modules');
    if (existsSync(nm)) found.push(nm);
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return found;
})();
function assertP2L8() {
  assert.deepEqual(SYSTEM_ANCESTOR_NODE_MODULES, [],
    `P2-L8: precondición incumplida; existe node_modules en un ancestro del sistema: ${SYSTEM_ANCESTOR_NODE_MODULES.join(', ')}`);
}

function walkNoSymlinks(dir) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    const st = lstatSync(p);
    assert.ok(!st.isSymbolicLink(), `symlink en la copia: ${p}`);
    if (st.isDirectory()) walkNoSymlinks(p);
  }
}

function writeCanary(dir, name, markers, where) {
  const d = path.join(dir, name);
  mkdirSync(d, { recursive: true });
  writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name, version: '0.0.0-canary', main: 'index.js' }));
  const marker = path.join(markers, `${name.replace('/', '__')}@${where}`);
  writeFileSync(path.join(d, 'index.js'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x');\nmodule.exports = { __t11dCanary: true };\n`);
}

/** Escenario: copia + canarios. omit = paquetes que se quitan de la copia. */
function run({ omit = [], places = ['outer', 'tmp', 'home_nm', 'home_nl'] } = {}) {
  assertP2L8();
  const t = mkdtempSync(path.join(ROOT_TMP, 's-'));
  const copy = path.join(t, 'outer', 'x402-teyolia');
  for (const f of ['dist', 'node_modules', 'package.json', 'package-lock.json']) cpSync(path.join(PACKAGE_ROOT, f), path.join(copy, f), { recursive: true, dereference: true });
  cpSync(path.join(FIXTURES, 't11d', 'probe-entry.mjs'), path.join(copy, 'probe-entry.mjs'));
  cpSync(path.join(FIXTURES, 't11d', 'resolve-hook.mjs'), path.join(copy, 'resolve-hook.mjs'));
  cpSync(path.join(PACKAGE_ROOT, SURFACES.vendor), path.join(copy, SURFACES.vendor));
  for (const name of omit) rmSync(path.join(copy, 'node_modules', name), { recursive: true, force: true });
  walkNoSymlinks(copy);
  const home = path.join(t, 'home');
  const markers = path.join(t, 'markers');
  const cwd = path.join(t, 'cwd');
  for (const d of [home, markers, cwd]) mkdirSync(d, { recursive: true });
  const dirs = { outer: path.join(t, 'outer', 'node_modules'), tmp: path.join(t, 'node_modules'), home_nm: path.join(home, '.node_modules'), home_nl: path.join(home, '.node_libraries') };
  for (const where of places) for (const name of CANARY_NAMES) writeCanary(dirs[where], name, markers, where);
  const env = { PATH: '/usr/bin:/bin', HOME: home, LANG: 'C.UTF-8', NODE_ENV: 'test', TEYOLIA_X402_LISTEN: '0' };
  const r = spawnSync(process.execPath, [path.join(copy, 'probe-entry.mjs')], { env, cwd, encoding: 'utf8', timeout: 20000 });
  const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('T11D '));
  const report = line ? JSON.parse(line.slice(5)) : null;
  const realCopy = realpathSync(copy);
  const fired = readdirSync(markers);
  const loaded = report ? [...report.cache, ...report.esm] : [];
  const outside = report ? loaded.filter((f) => !(f === realCopy || f.startsWith(realCopy + path.sep))) : null;
  return { r, report, fired, outside, realCopy, home };
}

const violations = (s) => {
  const v = [];
  if (s.r.status !== 0) v.push(`salida ${s.r.status}: ${s.r.stderr}`);
  if (!s.report) v.push('sin reporte de la sonda');
  if (s.fired.length) v.push(`canarios ejecutados: ${s.fired.join(', ')}`);
  if (s.outside?.length) v.push(`módulos fuera de la copia: ${s.outside.join(', ')}`);
  if (s.report?.surfaceError) v.push(`superficie vendorizada: ${s.report.surfaceError}`);
  return v;
};

describe('T-11d runtime con padre envenenado (dos ancestros + $HOME)', () => {
  test('precondición P2-L8: no existe /node_modules ni ningún node_modules en ancestros del tmp', (t) => {
    assert.equal(existsSync('/node_modules'), false, 'P2-L8: existe /node_modules del sistema');
    assertP2L8();
    t.diagnostic(`P2-L8 verificada: sin /node_modules ni node_modules en ancestros de ${path.dirname(realpathSync(ROOT_TMP))}`);
  });
  test('positivo: fase 2 alcanzada, ningún canario, todo dentro de la copia', () => {
    const s = run();
    assert.deepEqual(violations(s), []);
    const inCopy = (pkg) => s.report.cache.some((f) => f.startsWith(path.join(s.realCopy, 'node_modules', pkg) + path.sep));
    for (const pkg of ['express', 'debug', 'supports-color', 'has-flag']) assert.ok(inCopy(pkg), `${pkg} cargado desde la copia`);
    // Fase 2: express solo lo carga server.js tras el guard (main.ts); su presencia prueba que se pasó el guard.
    assert.ok(s.report.cache.includes(path.join(s.realCopy, 'node_modules', 'express', 'lib', 'application.js')));
    assert.equal(s.report.exitCode, 0);
    // PR-2b C4 (P2-L4): la carga ESM se observa con el hook y queda dentro de la copia.
    const inEsm = (rel) => s.report.esm.includes(path.join(s.realCopy, rel));
    for (const rel of ['node_modules/@x402-xec/express/dist/index.js', 'node_modules/@x402-xec/core/dist/sqlite-invoice-store.js', 'node_modules/zod/index.js', 'dist/main.js']) assert.ok(inEsm(rel), `ESM observado: ${rel}`);
    // P2-L4: los módulos ESM reales (zod, @x402-xec/*) no están en Module._cache; sin el hook no se verían.
    assert.ok(!s.report.cache.some((f) => f.includes(`${path.sep}node_modules${path.sep}zod${path.sep}`) || f.includes(`${path.sep}@x402-xec${path.sep}`)), 'ESM ausente de Module._cache');
    // Cruce estático/runtime: todo archivo cargado en runtime está en el grafo estático (main ∪ vendor).
    const harness = new Set(['probe-entry.mjs', 'resolve-hook.mjs']);
    const missing = [...new Set([...s.report.cache, ...s.report.esm].map((f) => path.relative(s.realCopy, f)))].filter((r) => !harness.has(r) && !STATIC_FILES.has(r));
    assert.deepEqual(missing, [], 'cargado en runtime pero ausente del grafo estático');
    // Precondición L1P-L2: carpetas globales = $HOME/.node_modules, $HOME/.node_libraries, <prefix>/lib/node; esta última no existe.
    assert.deepEqual(s.report.globalPaths, [path.join(s.home, '.node_modules'), path.join(s.home, '.node_libraries'), s.report.prefixLibNode]);
    assert.equal(s.report.prefixLibNodeExists, false, '<prefix>/lib/node no debe existir en el runner');
  });
  test('d-n1: copia SIN supports-color ni has-flag (estado de 72505c4) -> falla (se ejecuta el canario del padre)', () => {
    const v = violations(run({ omit: ['supports-color', 'has-flag'] }));
    assert.ok(v.some((x) => /canarios ejecutados: .*supports-color@outer/.test(x)), JSON.stringify(v));
  });
  test('d-n2: copia sin un paquete del lockfile (ms) -> falla', () => {
    const v = violations(run({ omit: ['ms'] }));
    assert.ok(v.some((x) => /ms@outer/.test(x)), JSON.stringify(v));
  });
  test('d-n4: copia sin zod (dependencia ESM de @x402-xec/core) -> falla: el hook ESM ve zod resuelto en el ancestro', () => {
    // El import nombrado { z } falla al enlazar, así que el cuerpo del canario no llega a
    // ejecutarse (0 marcadores); la fuga se ve por la resolución (hook ESM) y la contención.
    const s = run({ omit: ['zod'] });
    const v = violations(s);
    assert.ok(s.report.esm.some((f) => f.endsWith(path.join('outer', 'node_modules', 'zod', 'index.js'))), JSON.stringify(v));
    assert.ok(v.some((x) => /módulos fuera de la copia: .*outer\/node_modules\/zod\/index\.js/.test(x)), JSON.stringify(v));
  });
  test('d-n3: solo canario en $HOME/.node_modules, sin O-1 -> falla', () => {
    const v = violations(run({ omit: ['supports-color', 'has-flag'], places: ['home_nm'] }));
    assert.ok(v.some((x) => /supports-color@home_nm/.test(x)), JSON.stringify(v));
  });
});
