// M5-V1 / OB-07 / RQ-14, opción A (Fernando, 2026-10-23 14:16 CDMX): `commit` (git rev-parse HEAD en el
// build) y `distManifestSha256` en el nivel superior de /teyolia-x402/health. El health expone un valor
// DECLARADO (dist/build-info.json): no recalcula el manifiesto (residual PT5-04 (iv)). Positivos y
// controles negativos:
//   B. Definición del conjunto cubierto y del manifiesto; build-info del dist/ real.
//   C. Identidad: build-info inválido -> { ok: false }; dist/ mutado -> --check sale 1, pero el
//      health lo sigue declarando (caracterización del residual).
//   D. Health: 200 con las 6 claves e idénticas en OFF, ON sin adaptadores y ON con adaptadores;
//      503 TEYOLIA_X402_BUILD_UNVERIFIED sin build-info válido (nunca null); x402 sigue en 503.
//   E. Build: positivo, clon desde bundle, limpieza de dist/, tarball sin .git, tarball dentro de otro
//      repo, git no disponible, HEAD sin commits, HEAD de 64 hex, árbol sucio, dist/ versionado, GIT_DIR.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { PACKAGE_ROOT, baselineEnv, http, launch, makeTmp } from './helpers.mjs';
import * as script from '../scripts/dist-manifest.mjs';
import { ON_ENV, startApp } from './pr4-harness.mjs';

const DIST = path.join(PACKAGE_ROOT, 'dist');
const idm = await import(pathToFileURL(path.join(DIST, 'build-identity.js')).href);
const server = await import(pathToFileURL(path.join(DIST, 'server.js')).href);
const SCRIPT = path.join(PACKAGE_ROOT, 'scripts', 'dist-manifest.mjs');
const nodeSha = (b) => createHash('sha256').update(b).digest('hex');
const tmp = mkdtempSync(path.join(tmpdir(), 'pr5-m5v1-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const copyDist = (base = tmp) => { const d = path.join(base, `d${n++}`, 'dist'); cpSync(DIST, d, { recursive: true }); return d; };
const cli = (args, opts = {}) => spawnSync(process.execPath, [opts.script ?? SCRIPT, ...args], { encoding: 'utf8', env: opts.env ?? process.env, cwd: opts.cwd });
const realInfo = JSON.parse(readFileSync(path.join(DIST, 'build-info.json'), 'utf8'));

describe('M5-V1 B: definición única del conjunto cubierto y del manifiesto', () => {
  test('archivos de identidad excluidos iguales en scripts/ y src/; manifiesto = referencia independiente; build-info del dist/ real válido', () => {
    assert.deepEqual([...idm.IDENTITY_FILES], [...script.IDENTITY_FILES]);
    assert.deepEqual([...script.IDENTITY_FILES], ['build-info.json', 'dist-manifest.sha256']);
    assert.equal(idm.RUNTIME_MANIFEST_RECOMPUTED, false, 'residual PT5-04 (iv): valor declarado');
    const m = script.computeManifest(DIST);
    const ref = execFileSync('sh', ['-c', "find . -type f ! -name build-info.json ! -name dist-manifest.sha256 | sed 's|^\\./||' | LC_ALL=C sort | while read f; do sha256sum \"$f\"; done"], { cwd: DIST, encoding: 'utf8' });
    assert.equal(ref, m.text, 'sha256sum (coreutils) da el mismo manifiesto');
    assert.equal(readFileSync(path.join(DIST, 'dist-manifest.sha256'), 'utf8'), m.text);
    assert.equal(nodeSha(readFileSync(path.join(DIST, 'dist-manifest.sha256'))), realInfo.distManifestSha256, 'sha256sum del manifiesto = distManifestSha256');
    assert.deepEqual(Object.keys(realInfo).sort(), ['commit', 'distManifestSha256', 'files', 'schema']);
    assert.equal(realInfo.files, m.files);
    assert.ok(!m.text.includes('build-info.json') && !m.text.includes('dist-manifest.sha256'), 'sin circularidad');
    for (const l of m.text.trimEnd().split('\n')) assert.match(l, /^[0-9a-f]{64} {2}[A-Za-z0-9._/-]+\.js$/);
    assert.deepEqual(idm.loadBuildIdentity(DIST), { ok: true, commit: realInfo.commit, distManifestSha256: realInfo.distManifestSha256 });
  });
  test('commit del build = git rev-parse HEAD del checkout; dist/ y build-info.json no versionados', () => {
    const git = (...a) => execFileSync('git', a, { cwd: PACKAGE_ROOT, encoding: 'utf8' });
    assert.equal(realInfo.commit, git('rev-parse', 'HEAD').trim());
    assert.equal(git('ls-files', '--', 'dist'), '');
    assert.doesNotThrow(() => git('check-ignore', '-q', 'dist/build-info.json'));
  });
});

describe('M5-V1 C: identidad declarada y controles negativos', () => {
  test('control positivo: copia exacta -> ok y --check sale 0', () => {
    const d = copyDist();
    assert.deepEqual(idm.loadBuildIdentity(d), { ok: true, commit: realInfo.commit, distManifestSha256: realInfo.distManifestSha256 });
    assert.equal(cli(['--check', d]).status, 0);
  });
  const bi = (d, f) => { const p = path.join(d, 'build-info.json'); const j = JSON.parse(readFileSync(p, 'utf8')); writeFileSync(p, JSON.stringify(f(j))); };
  const invalid = {
    'falta build-info.json': (d) => unlinkSync(path.join(d, 'build-info.json')),
    'build-info.json no es JSON': (d) => writeFileSync(path.join(d, 'build-info.json'), '{'),
    'commit null': (d) => bi(d, (j) => ({ ...j, commit: null })),
    'commit de 39 hex': (d) => bi(d, (j) => ({ ...j, commit: j.commit.slice(1) })),
    'commit en mayúsculas': (d) => bi(d, (j) => ({ ...j, commit: j.commit.toUpperCase() })),
    'commit de 64 hex': (d) => bi(d, (j) => ({ ...j, commit: 'a'.repeat(64) })),
    'distManifestSha256 null': (d) => bi(d, (j) => ({ ...j, distManifestSha256: null })),
    'clave extra': (d) => bi(d, (j) => ({ ...j, dirty: false })),
    'falta files': (d) => bi(d, ({ files, ...j }) => j),
    'schema 2': (d) => bi(d, (j) => ({ ...j, schema: 2 })),
  };
  for (const [label, mutate] of Object.entries(invalid)) {
    test(`control negativo: ${label} -> { ok: false } y --check sale 1`, () => {
      const d = copyDist();
      mutate(d);
      const r = idm.loadBuildIdentity(d);
      assert.equal(r.ok, false);
      assert.equal(typeof r.reason, 'string');
      assert.equal(cli(['--check', d]).status, 1);
    });
  }
  const mutated = {
    'un byte añadido a server.js': (d) => appendFileSync(path.join(d, 'server.js'), ' '),
    'archivo extra en dist/': (d) => writeFileSync(path.join(d, 'extra.js'), 'export {};\n'),
    'archivo faltante (policy.js)': (d) => unlinkSync(path.join(d, 'policy.js')),
    'manifiesto editado': (d) => appendFileSync(path.join(d, 'dist-manifest.sha256'), '\n'),
    'falta dist-manifest.sha256': (d) => unlinkSync(path.join(d, 'dist-manifest.sha256')),
    'distManifestSha256 alterado (forma válida)': (d) => bi(d, (j) => ({ ...j, distManifestSha256: 'f'.repeat(64) })),
    'enlace simbólico en dist/': (d) => symlinkSync(path.join(d, 'main.js'), path.join(d, 'link.js')),
  };
  for (const [label, mutate] of Object.entries(mutated)) {
    test(`control negativo: ${label} -> --check sale 1; el health lo sigue declarando (residual PT5-04 (iv))`, () => {
      const d = copyDist();
      mutate(d);
      const c = cli(['--check', d]);
      assert.equal(c.status, 1, c.stdout);
      assert.equal(idm.loadBuildIdentity(d).ok, true, 'caracterización: valor declarado, no medido');
    });
  }
});

describe('M5-V1 D: health (opción A) y fallo cerrado', () => {
  const listen = (app) => new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  test('identidad verificada: 200 y exactamente las 6 claves', async () => {
    const s = await listen(server.createApp({ NODE_ENV: 'test' }));
    try {
      const h = await http(s.address().port, 'GET', server.HEALTH_ROUTE);
      assert.equal(h.status, 200);
      assert.deepEqual(h.json, { status: 'ok', component: 'x402-teyolia', x402Enabled: false, limitsZero: true, commit: realInfo.commit, distManifestSha256: realInfo.distManifestSha256 });
    } finally { s.close(); }
  });
  test('valores idénticos con OFF, ON sin adaptadores y ON con adaptadores; sin datos del entorno', async () => {
    for (const [env, withAdapters] of [[{ NODE_ENV: 'test' }, true], [ON_ENV, false], [ON_ENV, true]]) {
      const h = await startApp({ env, withAdapters });
      try {
        const r = await h.req('GET', server.HEALTH_ROUTE);
        assert.equal(r.status, 200);
        assert.deepEqual(Object.keys(r.json).sort(), ['commit', 'component', 'distManifestSha256', 'limitsZero', 'status', 'x402Enabled']);
        assert.equal(r.json.commit, realInfo.commit);
        assert.equal(r.json.distManifestSha256, realInfo.distManifestSha256);
        assert.equal(r.json.x402Enabled, env.TEYOLIA_X402_ENABLED === 'true');
      } finally { await h.close(); }
    }
  });
  for (const env of [{ NODE_ENV: 'test' }, { NODE_ENV: 'test', TEYOLIA_X402_ENABLED: 'true' }]) {
    test(`identidad no verificada (${env.TEYOLIA_X402_ENABLED ? 'ON' : 'OFF'}): health 503 TEYOLIA_X402_BUILD_UNVERIFIED sin commit ni hash; x402 sigue en 503`, async () => {
      const s = await listen(server.createApp(env, undefined, { buildIdentity: { ok: false, reason: 'prueba' } }));
      try {
        const h = await http(s.address().port, 'GET', server.HEALTH_ROUTE);
        assert.equal(h.status, 503);
        assert.deepEqual(h.json, { status: 'build_unverified', component: 'x402-teyolia', x402Enabled: env.TEYOLIA_X402_ENABLED === 'true', limitsZero: true, error: 'TEYOLIA_X402_BUILD_UNVERIFIED' });
        assert.ok(!h.body.includes('prueba'), 'el motivo no se expone');
        const d = await http(s.address().port, 'GET', server.DEMO_ROUTE);
        assert.equal(d.status, 503);
      } finally { s.close(); }
    });
  }
  test('proceso real desde una copia de dist/: exacta -> 200; sin build-info o build-info inválido -> arranca, health 503, x402 503; .js mutado -> 200 declarado (residual)', async () => {
    const base = mkdtempSync(path.join(PACKAGE_ROOT, '.m5v1-tmp-'));   // dentro del paquete: resuelve node_modules
    const home = makeTmp('x402-m5v1-home-');
    try {
      for (const [label, mutate, ok] of [['exacta', () => {}, true],
        ['sin build-info.json', (d) => unlinkSync(path.join(d, 'build-info.json')), false],
        ['build-info.json con commit null', (d) => { const p = path.join(d, 'build-info.json'); writeFileSync(p, JSON.stringify({ ...realInfo, commit: null })); }, false],
        ['allowlist.js mutado (residual: valor declarado)', (d) => appendFileSync(path.join(d, 'allowlist.js'), '\n'), true]]) {
        const d = copyDist(base);
        mutate(d);
        const r = await launch({ env: baselineEnv(home.dir), cwd: makeTmp('x402-cwd-').dir, main: path.join(d, 'main.js') });
        assert.equal(r.started, true, `${label}: ${r.stderr}`);
        try {
          const h = await http(r.port, 'GET', '/teyolia-x402/health');
          assert.equal(h.status, ok ? 200 : 503, label);
          if (ok) assert.equal(h.json.commit, realInfo.commit);
          else { assert.equal(h.json.error, 'TEYOLIA_X402_BUILD_UNVERIFIED'); assert.equal('commit' in h.json, false); assert.match(r.stderr, /identidad de build no válida/); }
          assert.equal((await http(r.port, 'GET', '/x402/v1/access/demo')).status, 503, label);
        } finally { await r.stop(); }
      }
    } finally { rmSync(base, { recursive: true, force: true }); home.cleanup(); }
  });
});

describe('M5-V1 E: el build falla cerrado si no puede determinar el commit', () => {
  const gitc = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@localhost.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: tmp, LC_ALL: 'C' } });
  // Repo temporal con las entradas del build; node_modules es un enlace al del paquete (no se versiona).
  function makeRepo({ init = true, commit = true, format } = {}) {
    const repo = path.join(tmp, `repo${n++}`);
    const pkg = path.join(repo, 'x402-teyolia');
    mkdirSync(path.join(pkg, 'scripts'), { recursive: true });
    for (const f of ['src', 'tsconfig.json', 'package.json', 'package-lock.json']) cpSync(path.join(PACKAGE_ROOT, f), path.join(pkg, f), { recursive: true });
    cpSync(SCRIPT, path.join(pkg, 'scripts', 'dist-manifest.mjs'));
    writeFileSync(path.join(pkg, 'README.md'), 'r\n');
    symlinkSync(path.join(PACKAGE_ROOT, 'node_modules'), path.join(pkg, 'node_modules'));
    writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n**/node_modules\ndist/\n**/dist/\n');
    if (init) {
      gitc(repo, 'init', '-q', ...(format ? [`--object-format=${format}`] : []));
      gitc(repo, 'add', '-A');
      if (commit) gitc(repo, 'commit', '-q', '-m', 'base');
    }
    return { repo, pkg, script: path.join(pkg, 'scripts', 'dist-manifest.mjs') };
  }
  const build = (r, env) => cli(['--build'], { script: r.script, env });
  const noIdentity = (r) => !existsSync(path.join(r.pkg, 'dist', 'build-info.json')) && !existsSync(path.join(r.pkg, 'dist', 'dist-manifest.sha256'));

  test('positivo: commit = HEAD, distManifestSha256 = el del dist/ real (mismas entradas), --check y --rebuild-compare OK', () => {
    const r = makeRepo();
    const b = build(r);
    assert.equal(b.status, 0, b.stderr);
    const info = JSON.parse(readFileSync(path.join(r.pkg, 'dist', 'build-info.json'), 'utf8'));
    assert.equal(info.commit, gitc(r.repo, 'rev-parse', 'HEAD').trim());
    assert.equal(info.distManifestSha256, realInfo.distManifestSha256, 'build determinista: mismo manifiesto que el dist/ del paquete');
    assert.equal(cli(['--check'], { script: r.script }).status, 0);
    const rc = cli(['--rebuild-compare'], { script: r.script });
    assert.equal(rc.status, 0, rc.stderr);
    // Control negativo de M5-V1: dist/ mutado con identidad recalculada de forma coherente.
    const d = path.join(r.pkg, 'dist');
    appendFileSync(path.join(d, 'server.js'), ' ');
    const m = script.computeManifest(d);
    writeFileSync(path.join(d, 'dist-manifest.sha256'), m.text);
    writeFileSync(path.join(d, 'build-info.json'), JSON.stringify({ ...info, distManifestSha256: m.distManifestSha256 }));
    assert.equal(cli(['--check'], { script: r.script }).status, 0, '--check solo ve coherencia interna');
    const neg = cli(['--rebuild-compare'], { script: r.script });
    assert.equal(neg.status, 1); assert.match(neg.stderr, /M5-V1: FALLA/);
    // HEAD avanza (commit fuera de las entradas): el build-info ya no declara el HEAD.
    assert.equal(build(r).status, 0);
    writeFileSync(path.join(r.pkg, 'README.md'), 'r2\n'); gitc(r.repo, 'commit', '-q', '-am', 'readme');
    const adv = cli(['--rebuild-compare'], { script: r.script });
    assert.equal(adv.status, 1); assert.match(adv.stderr, /HEAD es/);
  });
  test('tarball sin .git (git archive | tar) -> sale 1, sin dist/ ni identidad', () => {
    const r = makeRepo();
    const out = path.join(tmp, `tar${n++}`); mkdirSync(out);
    execFileSync('sh', ['-c', `git archive HEAD | tar -x -C "${out}"`], { cwd: r.repo });
    symlinkSync(path.join(PACKAGE_ROOT, 'node_modules'), path.join(out, 'x402-teyolia', 'node_modules'));
    const t = { pkg: path.join(out, 'x402-teyolia'), script: path.join(out, 'x402-teyolia', 'scripts', 'dist-manifest.mjs') };
    const b = build(t);
    assert.equal(b.status, 1); assert.match(b.stderr, /no hay repositorio git/);
    assert.equal(existsSync(path.join(t.pkg, 'dist')), false);
    const g = build(t, { ...process.env, GIT_DIR: path.join(r.repo, '.git'), GIT_WORK_TREE: out });
    assert.equal(g.status, 1, 'GIT_DIR/GIT_WORK_TREE del entorno se ignoran'); assert.ok(noIdentity(t));
  });
  test('tarball extraído dentro de OTRO repositorio -> sale 1 (el repo no es el del paquete)', () => {
    const r = makeRepo();
    const outer = makeRepo({ commit: true });
    const inner = path.join(outer.repo, 'vendored'); mkdirSync(inner);
    execFileSync('sh', ['-c', `git archive HEAD | tar -x -C "${inner}"`], { cwd: r.repo });
    symlinkSync(path.join(PACKAGE_ROOT, 'node_modules'), path.join(inner, 'x402-teyolia', 'node_modules'));
    const t = { pkg: path.join(inner, 'x402-teyolia'), script: path.join(inner, 'x402-teyolia', 'scripts', 'dist-manifest.mjs') };
    const b = build(t);
    assert.equal(b.status, 1); assert.match(b.stderr, /no es el de este paquete/); assert.ok(noIdentity(t));
  });
  test('git no disponible en PATH -> sale 1', () => {
    const r = makeRepo();
    const b = build(r, { PATH: path.dirname(process.execPath), HOME: tmp });
    assert.equal(b.status, 1); assert.match(b.stderr, /git no disponible/); assert.ok(noIdentity(r));
  });
  test('repositorio sin commits (rev-parse HEAD falla) -> sale 1', () => {
    const r = makeRepo({ commit: false });
    const b = build(r);
    assert.equal(b.status, 1); assert.match(b.stderr, /rev-parse HEAD falló/); assert.ok(noIdentity(r));
  });
  test('repositorio SHA-256 (HEAD de 64 hex) -> sale 1', () => {
    const r = makeRepo({ format: 'sha256' });
    const b = build(r);
    assert.equal(b.status, 1); assert.match(b.stderr, /40 hex/); assert.ok(noIdentity(r));
  });
  for (const [label, dirty] of [
    ['src/ modificado', (r) => appendFileSync(path.join(r.pkg, 'src', 'policy.ts'), '\n')],
    ['archivo sin versionar en src/', (r) => writeFileSync(path.join(r.pkg, 'src', 'nuevo.ts'), 'export {};\n')],
    ['tsconfig.json modificado', (r) => appendFileSync(path.join(r.pkg, 'tsconfig.json'), '\n')],
    ['package-lock.json modificado', (r) => appendFileSync(path.join(r.pkg, 'package-lock.json'), '\n')],
    ['scripts/dist-manifest.mjs modificado', (r) => appendFileSync(r.script, '\n')],
    ['README.md modificado (fuera de src/: también bloquea)', (r) => appendFileSync(path.join(r.pkg, 'README.md'), 'x\n')],
    ['archivo sin versionar en la raíz del repo', (r) => writeFileSync(path.join(r.repo, 'notas.txt'), 'x\n')],
    ['cambio solo en el índice (staged)', (r) => { appendFileSync(path.join(r.pkg, 'src', 'policy.ts'), '\n'); gitc(r.repo, 'add', '-A'); }],
  ]) {
    test(`árbol sucio: ${label} -> sale 1`, () => {
      const r = makeRepo();
      dirty(r);
      const b = build(r);
      assert.equal(b.status, 1); assert.match(b.stderr, /árbol de trabajo sucio/); assert.ok(noIdentity(r));
    });
  }
  test('reproducción desde un bundle: clon del bundle -> build OK con el mismo commit y el mismo distManifestSha256', () => {
    const r = makeRepo();
    const bundle = path.join(tmp, `b${n++}.bundle`);
    gitc(r.repo, 'bundle', 'create', '-q', bundle, 'HEAD');
    const head = gitc(r.repo, 'rev-parse', 'HEAD').trim();
    const w = path.join(tmp, `clone${n++}`);
    gitc(tmp, 'clone', '-q', bundle, w);
    gitc(w, '-c', 'advice.detachedHead=false', 'checkout', '-q', '--detach', head);
    symlinkSync(path.join(PACKAGE_ROOT, 'node_modules'), path.join(w, 'x402-teyolia', 'node_modules'));
    const t = { pkg: path.join(w, 'x402-teyolia'), script: path.join(w, 'x402-teyolia', 'scripts', 'dist-manifest.mjs') };
    const b = build(t);
    assert.equal(b.status, 0, b.stderr);
    const info = JSON.parse(readFileSync(path.join(t.pkg, 'dist', 'build-info.json'), 'utf8'));
    assert.equal(info.commit, head);
    assert.equal(info.distManifestSha256, realInfo.distManifestSha256);
  });
  test('el build limpia dist/: un archivo viejo en dist/ desaparece y no entra en el manifiesto', () => {
    const r = makeRepo();
    mkdirSync(path.join(r.pkg, 'dist')); writeFileSync(path.join(r.pkg, 'dist', 'stale.js'), 'export const viejo = 1;\n');
    const b = build(r);
    assert.equal(b.status, 0, b.stderr);
    assert.equal(existsSync(path.join(r.pkg, 'dist', 'stale.js')), false);
    assert.ok(!readFileSync(path.join(r.pkg, 'dist', 'dist-manifest.sha256'), 'utf8').includes('stale.js'));
    assert.equal(JSON.parse(readFileSync(path.join(r.pkg, 'dist', 'build-info.json'), 'utf8')).distManifestSha256, realInfo.distManifestSha256);
  });
  test('dist/ versionado -> sale 1', () => {
    const r = makeRepo();
    mkdirSync(path.join(r.pkg, 'dist')); writeFileSync(path.join(r.pkg, 'dist', 'build-info.json'), '{}');
    gitc(r.repo, 'add', '-f', 'x402-teyolia/dist/build-info.json'); gitc(r.repo, 'commit', '-q', '-m', 'dist');
    const b = build(r);
    assert.equal(b.status, 1); assert.match(b.stderr, /dist\/ está versionado/); assert.ok(noIdentity(r));
  });
});
