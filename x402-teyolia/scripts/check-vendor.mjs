#!/usr/bin/env node
// D-01 de instalación (INF-042 §5.1 (1), §11.7; plan PR-2 §5.2.1; dictamen PR-2 P2-L5, P2-L7).
// Falla cerrado si la superficie x402 no sale de los tarballs vendorizados de 0f409de:
//   V1 SHA256SUMS: exactamente los dos tarballs, con el SHA-256 registrado en PROVENANCE.json.
//   V2 package.json: @x402-xec/* = file:vendor/x402-xec-0f409de/‹tarball›; overrides exactos del cierre.
//   V3 lockfile: toda entrada @x402-xec/* resuelve a file:vendor/... con integrity = sha512 del
//      tarball; ninguna sale del registro (prohibido @x402-xec/*@0.1.0 de npm).
//   V4 cierre transitivo: versión e integrity = pnpm-lock.yaml de 0f409de (PROVENANCE.transitive).
//   V5 zod único (P2-L7): exactamente una entrada zod en el lock, 4.4.3, integrity del pnpm-lock.
//   V6 instalado (si hay node_modules): un solo directorio zod; @x402-xec/* y su cierre son
//      directorios reales (sin symlinks) con la versión del lock, y el conjunto instalado es exactamente
//      el del lock: falta cualquier paquete esperado -> falla (Codex #64 r4295643565).
// Uso: node scripts/check-vendor.mjs
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(HERE, '..');
export const VENDOR_REL = 'vendor/x402-xec-0f409de';
const SCOPE = '@x402-xec/';

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const nameOfKey = (k) => k.slice(k.lastIndexOf('node_modules/') + 'node_modules/'.length);

/** Busca directorios de paquete `name` bajo node_modules (recursivo, sin seguir symlinks). */
function findInstalled(nmRoot, name, acc = []) {
  if (!existsSync(nmRoot)) return acc;
  for (const e of readdirSync(nmRoot)) {
    if (e.startsWith('.')) continue;
    const p = path.join(nmRoot, e);
    if (e.startsWith('@')) {
      for (const s of readdirSync(p)) visit(path.join(p, s), `${e}/${s}`);
    } else visit(p, e);
  }
  function visit(dir, n) {
    if (n === name) acc.push(dir);
    const st = lstatSync(dir);
    if (st.isDirectory()) findInstalled(path.join(dir, 'node_modules'), name, acc);
  }
  return acc;
}

export function checkVendor(opts = {}) {
  const root = opts.packageRoot ?? PACKAGE_ROOT;
  const vendorDir = opts.vendorDir ?? path.join(root, VENDOR_REL);
  const prov = opts.provenance ?? readJson(path.join(vendorDir, 'PROVENANCE.json'));
  const pkg = opts.pkg ?? readJson(path.join(root, 'package.json'));
  const lock = opts.lock ?? readJson(path.join(root, 'package-lock.json'));
  const checkInstalled = opts.checkInstalled ?? existsSync(path.join(root, 'node_modules'));
  const problems = [];
  const P = (m) => problems.push(m);

  // V1
  const sums = readFileSync(path.join(vendorDir, 'SHA256SUMS'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/));
  const want = Object.keys(prov.tarballs).sort();
  const got = sums.map(([, f]) => f).sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) P(`V1: SHA256SUMS lista ${got.join(',')} y se esperaba ${want.join(',')}`);
  const tarIntegrity = {};
  for (const [sha, f] of sums) {
    const meta = prov.tarballs[f];
    const file = path.join(vendorDir, f);
    if (!meta || !existsSync(file)) { P(`V1: tarball no registrado o ausente: ${f}`); continue; }
    const bytes = readFileSync(file);
    const real = createHash('sha256').update(bytes).digest('hex');
    if (real !== sha || real !== meta.sha256) P(`V1: SHA-256 de ${f} = ${real}; SHA256SUMS ${sha}; PROVENANCE ${meta.sha256}`);
    tarIntegrity[meta.name] = { file: f, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`, version: meta.version };
    if (tarIntegrity[meta.name].integrity !== meta.integrity) P(`V1: sha512 de ${f} distinto de PROVENANCE`);
  }
  // V2
  for (const [name, t] of Object.entries(tarIntegrity)) {
    const spec = pkg.dependencies?.[name];
    if (spec !== `file:${VENDOR_REL}/${t.file}`) P(`V2: package.json ${name} = ${spec ?? '(ausente)'}; se exige file:${VENDOR_REL}/${t.file}`);
  }
  for (const sect of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [n, s] of Object.entries(pkg[sect] ?? {})) if (n.startsWith(SCOPE) && !String(s).startsWith(`file:${VENDOR_REL}/`)) P(`V2: ${sect}.${n} = ${s} (no vendorizado)`);
  }
  // Todo el cierre transitivo fijado por overrides exactos (P2-L7 generalizado: el 2026-10-15
  // npm ya resolvía ecashaddrjs 2.0.3 dentro de ^2.0.1, no solo zod 4.6.5 dentro de ^4.4.3).
  for (const [n, t] of Object.entries(prov.transitive)) if (pkg.overrides?.[n] !== t.version) P(`V2: overrides.${n} = ${pkg.overrides?.[n] ?? '(ausente)'}; se exige ${t.version}`);
  // V3, V4, V5
  const entries = Object.entries(lock.packages ?? {}).filter(([k]) => k !== '');
  for (const [k, meta] of entries) {
    const name = nameOfKey(k);
    if (name.startsWith(SCOPE)) {
      const t = tarIntegrity[name];
      if (!t) { P(`V3: entrada ${k} sin tarball vendorizado`); continue; }
      if (meta.resolved !== `file:${VENDOR_REL}/${t.file}`) P(`V3: ${k} resolved = ${meta.resolved}; se exige file:${VENDOR_REL}/${t.file}`);
      if (meta.integrity !== t.integrity) P(`V3: ${k} integrity distinta del tarball`);
      if (meta.version !== t.version) P(`V3: ${k} versión ${meta.version} ≠ ${t.version}`);
    }
    if (typeof meta.resolved === 'string' && /registry/.test(meta.resolved) && meta.resolved.includes('/@x402-xec/')) P(`V3: ${k} sale del registro npm (prohibido): ${meta.resolved}`);
    const tr = prov.transitive[name];
    if (tr && !meta.dev && (meta.version !== tr.version || meta.integrity !== tr.integrity)) P(`V4: ${k} = ${meta.version} ${String(meta.integrity).slice(0, 19)}…; pnpm-lock 0f409de exige ${tr.version} ${tr.integrity.slice(0, 19)}…`);
  }
  for (const name of Object.keys(tarIntegrity)) if (!entries.some(([k]) => nameOfKey(k) === name)) P(`V3: ${name} no está en el lockfile`);
  for (const name of Object.keys(prov.transitive)) if (!entries.some(([k]) => nameOfKey(k) === name)) P(`V4: ${name} no está en el lockfile`);
  const zods = entries.filter(([k]) => nameOfKey(k) === 'zod');
  if (zods.length !== 1) P(`V5: zod debe aparecer exactamente una vez en el lockfile (hay ${zods.length}: ${zods.map(([k, m]) => `${k}@${m.version}`).join(', ')})`);
  // V6
  if (checkInstalled) {
    const nm = path.join(root, 'node_modules');
    const zodDirs = findInstalled(nm, 'zod');
    if (zodDirs.length !== 1) P(`V6: zod instalado ${zodDirs.length} veces: ${zodDirs.map((d) => path.relative(root, d)).join(', ')}`);
    // Codex #64 r4295643565: conjunto exacto. Cada entrada del lock de @x402-xec/* y de su cierre
    // (no dev) debe existir en su ruta derivada del lockfile antes de validar versión o symlink.
    // Faltar cualquiera, o que falte node_modules con checkInstalled forzado, falla. Lo instalado de más ya fallaba (sin entrada en el lock).
    if (!existsSync(nm)) P('V6: falta node_modules');
    const expectedNames = new Set([...Object.keys(tarIntegrity), ...Object.keys(prov.transitive)]);
    for (const [k, meta] of entries) {
      if (!k || meta.dev || !expectedNames.has(nameOfKey(k))) continue;
      const dir = path.join(root, ...k.split('/'));
      if (!existsSync(path.join(dir, 'package.json'))) P(`V6: ${k} (${meta.version}) del lockfile no está instalado`);
    }
    for (const name of expectedNames) {
      for (const dir of findInstalled(nm, name)) {
        const rel = path.relative(root, dir);
        if (lstatSync(dir).isSymbolicLink()) { P(`V6: ${rel} es un symlink`); continue; }
        const v = readJson(path.join(dir, 'package.json')).version;
        const meta = lock.packages?.[rel.split(path.sep).join('/')];
        if (!meta || meta.version !== v) P(`V6: ${rel} instalado ${v}; lock ${meta?.version ?? '(sin entrada)'}`);
      }
    }
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkVendor();
  process.stdout.write(problems.length === 0 ? 'check-vendor: OK (V1–V6; x402-XEC 0f409de)\n' : `check-vendor: FALLA (${problems.length})\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}
