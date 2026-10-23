#!/usr/bin/env node
// M5-V1 / OB-07 / RQ-14, opción A (Fernando, 2026-10-23 14:16 CDMX). Identidad de artefacto del
// proceso x402: `commit` (git rev-parse HEAD durante el build) y `distManifestSha256`.
//
// Conjunto cubierto: todo archivo regular de dist/ salvo los archivos de identidad
// (build-info.json y dist-manifest.sha256), que quedan FUERA para evitar circularidad. Manifiesto:
// `‹sha256›  ‹ruta›\n` por archivo cubierto (formato de sha256sum), orden de bytes de la ruta;
// distManifestSha256 = SHA-256 del manifiesto (= sha256sum de dist/dist-manifest.sha256). Misma
// distManifestSha256 es el valor DECLARADO que lee el health (src/build-identity.ts no lo recalcula).
//
// Flujo de `--build` (determinista; falla cerrado y no deja identidad si algo falla):
//   0) borra dist/ y determina el commit de forma inequívoca (ver resolveCommit); si no se puede,
//      sale 1 SIN compilar: no hay artefacto sin identidad verificable;
//   1) construye los artefactos cubiertos (tsc del lockfile);
//   2) genera el manifiesto SHA-256 del conjunto cubierto (dist/dist-manifest.sha256);
//   3) calcula distManifestSha256;
//   4) escribe dist/build-info.json = { schema: 1, commit, distManifestSha256, files };
//   5) verifica con un rebuild limpio en un directorio temporal que el manifiesto cubierto coincide,
//      y que HEAD y las entradas no cambiaron durante el build. Si no, borra los archivos de identidad.
// dist/ no se versiona (.gitignore de la raíz): el commit de la build nunca es un HEAD que contenga
// su propia build-info. Sin variables de entorno nuevas (las GIT_* del entorno se ignoran) y sin red.
//
// Uso:
//   node scripts/dist-manifest.mjs --build              build completo (npm run build)
//   node scripts/dist-manifest.mjs --check [dir]        verifica identidad de dir (def. dist/) en disco
//   node scripts/dist-manifest.mjs --rebuild-compare    M5-V1: rebuild limpio + comparación + commit = HEAD
//   node scripts/dist-manifest.mjs --print [dir]        imprime el manifiesto y su hash

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(HERE, '..');
export const BUILD_INFO = 'build-info.json';
export const MANIFEST = 'dist-manifest.sha256';
export const IDENTITY_FILES = Object.freeze([BUILD_INFO, MANIFEST]);
export const SCHEMA = 1;

export class BuildIdentityError extends Error {}
const fail = (msg) => { throw new BuildIdentityError(`dist-manifest: ${msg}`); };
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function listCovered(dir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const name of readdirSync(abs)) {
      const a = path.join(abs, name);
      const r = rel ? `${rel}/${name}` : name;
      const st = lstatSync(a);
      if (st.isSymbolicLink()) fail(`enlace simbólico no admitido: ${r}`);
      if (st.isDirectory()) walk(a, r);
      else if (st.isFile()) { if (!IDENTITY_FILES.includes(r)) out.push(r); }
      else fail(`tipo de archivo no admitido: ${r}`);
    }
  };
  walk(dir, '');
  return out.sort((x, y) => Buffer.compare(Buffer.from(x, 'utf8'), Buffer.from(y, 'utf8')));
}

export function computeManifest(dir) {
  const files = listCovered(dir);
  if (files.length === 0) fail(`${dir} no tiene archivos cubiertos`);
  const text = files.map((f) => `${sha256(readFileSync(path.join(dir, f)))}  ${f}\n`).join('');
  return { text, files: files.length, distManifestSha256: sha256(text) };
}

function git(args, cwd) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  env.LC_ALL = 'C';
  return spawnSync('git', args, { cwd, env, encoding: 'utf8' });
}

/**
 * Commit inequívoco del paquete o BuildIdentityError. Falla si: git no está disponible; no hay
 * repositorio (p. ej. un tarball sin .git); el repositorio no es el de este paquete (tarball extraído
 * dentro de otro repo); HEAD no resuelve a un commit de 40 hex; dist/ está versionado; o el árbol de
 * trabajo está sucio: cualquier cambio sin commit (preparado o no) o archivo sin versionar y no
 * ignorado en TODO el repositorio (`git status --porcelain` no vacío; PT5-04 (ii)). Es más estricto
 * que limitarlo a las entradas del build, y es lo que hace inequívoco el commit.
 */
export function resolveCommit(packageRoot = PACKAGE_ROOT) {
  const top = git(['rev-parse', '--show-toplevel'], packageRoot);
  if (top.error) fail(`git no disponible (${top.error.code ?? top.error.message}); no se puede determinar el commit`);
  if (top.status !== 0) fail('no hay repositorio git (¿tarball sin .git?); no se puede determinar el commit');
  const expected = realpathSync(path.dirname(packageRoot));
  if (realpathSync(top.stdout.trim()) !== expected) fail(`el repositorio git (${top.stdout.trim()}) no es el de este paquete (${expected})`);
  const head = git(['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}'], packageRoot);
  if (head.status !== 0) fail('git rev-parse HEAD falló (¿repositorio sin commits?)');
  const commit = head.stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(commit) || head.stdout !== `${commit}\n`) fail(`HEAD no es un commit de 40 hex: ${JSON.stringify(head.stdout)}`);
  const tracked = git(['ls-files', '-z', '--', 'dist'], packageRoot);
  if (tracked.status !== 0 || tracked.stdout !== '') fail('dist/ está versionado o git ls-files falló');
  const st = git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], packageRoot);
  if (st.status !== 0) fail('git status falló');
  if (st.stdout !== '') fail(`árbol de trabajo sucio (cambios sin commit o archivos sin versionar): ${st.stdout.split('\0').filter(Boolean).slice(0, 10).join(', ')}`);
  return commit;
}

export function rebuildInto(outDir, packageRoot = PACKAGE_ROOT) {
  const tsc = path.join(packageRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  const r = spawnSync(process.execPath, [tsc, '-p', path.join(packageRoot, 'tsconfig.json'), '--outDir', outDir], { cwd: packageRoot, encoding: 'utf8' });
  if (r.status !== 0) fail(`tsc falló (${r.status}): ${r.stdout}${r.stderr}`);
}

export function readBuildInfo(dir) {
  let bi;
  try { bi = JSON.parse(readFileSync(path.join(dir, BUILD_INFO), 'utf8')); } catch { fail(`${BUILD_INFO} ausente o ilegible`); }
  if (bi === null || typeof bi !== 'object' || Array.isArray(bi) || Object.keys(bi).sort().join(',') !== 'commit,distManifestSha256,files,schema'
      || bi.schema !== SCHEMA || typeof bi.commit !== 'string' || !/^[0-9a-f]{40}$/.test(bi.commit)
      || typeof bi.distManifestSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(bi.distManifestSha256) || !Number.isSafeInteger(bi.files)) {
    fail(`${BUILD_INFO} con forma inválida`);
  }
  return bi;
}

/** Verifica build-info.json y dist-manifest.sha256 contra el dir en disco. */
export function checkDir(dir) {
  const bi = readBuildInfo(dir);
  const m = computeManifest(dir);
  let stored;
  try { stored = readFileSync(path.join(dir, MANIFEST), 'utf8'); } catch { fail(`${MANIFEST} ausente o ilegible`); }
  if (stored !== m.text) fail(`FALLA: ${MANIFEST} no coincide con el dist/ en disco`);
  if (m.distManifestSha256 !== bi.distManifestSha256 || m.files !== bi.files) {
    fail(`FALLA: en disco ${m.distManifestSha256} (${m.files}) ≠ build-info ${bi.distManifestSha256} (${bi.files})`);
  }
  return { ...bi };
}

function withTmp(fn) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'x402-m5v1-'));
  try { return fn(path.join(tmp, 'dist')); } finally { rmSync(tmp, { recursive: true, force: true }); }
}

export function build(packageRoot = PACKAGE_ROOT) {
  const dist = path.join(packageRoot, 'dist');
  rmSync(dist, { recursive: true, force: true });
  const commit = resolveCommit(packageRoot);                       // 0
  rebuildInto(dist, packageRoot);                                  // 1
  const m = computeManifest(dist);                                 // 2, 3
  writeFileSync(path.join(dist, MANIFEST), m.text);
  const info = { schema: SCHEMA, commit, distManifestSha256: m.distManifestSha256, files: m.files };
  writeFileSync(path.join(dist, BUILD_INFO), `${JSON.stringify(info, null, 2)}\n`);   // 4
  try {                                                            // 5
    const re = withTmp((out) => { rebuildInto(out, packageRoot); return computeManifest(out); });
    if (re.text !== m.text) fail(`FALLA: el rebuild limpio da ${re.distManifestSha256}, el build ${m.distManifestSha256}`);
    if (resolveCommit(packageRoot) !== commit) fail('HEAD cambió durante el build');
    checkDir(dist);
  } catch (e) {
    for (const f of IDENTITY_FILES) rmSync(path.join(dist, f), { force: true });
    throw e;
  }
  return info;
}

function main(argv) {
  const [mode, arg] = argv;
  const dist = path.resolve(PACKAGE_ROOT, arg ?? 'dist');
  switch (mode) {
    case '--build': {
      const i = build();
      console.log(`dist-manifest: build OK; commit ${i.commit}; ${i.files} archivos cubiertos; distManifestSha256 ${i.distManifestSha256}`);
      return 0;
    }
    case '--check': {
      const i = checkDir(dist);
      console.log(`dist-manifest --check OK: commit ${i.commit}; distManifestSha256 ${i.distManifestSha256} (${i.files} archivos)`);
      return 0;
    }
    case '--rebuild-compare': {
      const bi = checkDir(dist);
      const head = resolveCommit();
      if (head !== bi.commit) fail(`FALLA: build-info declara ${bi.commit}, HEAD es ${head}`);
      const re = withTmp((out) => { rebuildInto(out); return computeManifest(out); });
      if (re.distManifestSha256 !== bi.distManifestSha256) fail(`M5-V1: FALLA: rebuild ${re.distManifestSha256} (${re.files}) ≠ build-info ${bi.distManifestSha256} (${bi.files})`);
      console.log(`M5-V1 OK: commit ${head}; rebuild = build-info = en disco = ${re.distManifestSha256} (${re.files} archivos)`);
      return 0;
    }
    case '--print': {
      const m = computeManifest(dist);
      process.stdout.write(m.text);
      console.log(`distManifestSha256 ${m.distManifestSha256}`);
      return 0;
    }
    default:
      console.error('uso: dist-manifest.mjs --build | --check [dir] | --rebuild-compare | --print [dir]');
      return 2;
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(String(e?.message ?? e)); process.exitCode = 1; }
}
