// D-01 de instalación (PR-2b C3; INF-042 §5.1 (1), §11.7; dictamen PR-2 P2-L5, P2-L7).
// Positivo sobre el árbol real y negativos por mutación (en memoria o en tmp).
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { PACKAGE_ROOT, VENDOR_REL, checkVendor } from '../scripts/check-vendor.mjs';

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const PKG = readJson(path.join(PACKAGE_ROOT, 'package.json'));
const LOCK = readJson(path.join(PACKAGE_ROOT, 'package-lock.json'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const TMP = mkdtempSync(path.join(tmpdir(), 'x402-vendor-'));
process.on('exit', () => rmSync(TMP, { recursive: true, force: true }));
const expect = (problems, re) => assert.ok(problems.some((p) => re.test(p)), `esperado ${re}; obtenido ${JSON.stringify(problems)}`);
const lockOnly = (lock, pkg = PKG) => checkVendor({ lock, pkg, checkInstalled: false });

describe('D-01 instalación: tarballs vendorizados de x402-XEC 0f409de', () => {
  test('positivo: V1–V6 en verde sobre el árbol real (con node_modules instalado)', () => {
    assert.deepEqual(checkVendor({ checkInstalled: true }), []);
  });
  test('V3 negativo: @x402-xec/core resuelto desde el registro npm (0.1.0) -> falla', () => {
    const lock = clone(LOCK);
    lock.packages['node_modules/@x402-xec/core'].resolved = 'https://registry.npmjs.org/@x402-xec/core/-/core-0.1.0.tgz';
    expect(lockOnly(lock), /V3: .*sale del registro npm \(prohibido\)/);
  });
  test('V3 negativo: integrity del lock distinta del tarball -> falla', () => {
    const lock = clone(LOCK);
    lock.packages['node_modules/@x402-xec/express'].integrity = 'sha512-AAAA';
    expect(lockOnly(lock), /V3: node_modules\/@x402-xec\/express integrity distinta/);
  });
  test('V3 negativo: copia anidada de @x402-xec/core desde npm -> falla', () => {
    const lock = clone(LOCK);
    lock.packages['node_modules/@x402-xec/express/node_modules/@x402-xec/core'] = { version: '0.1.0', resolved: 'https://registry.npmjs.org/@x402-xec/core/-/core-0.1.0.tgz', integrity: 'sha512-BBBB' };
    expect(lockOnly(lock), /V3: .*express\/node_modules\/@x402-xec\/core resolved/);
  });
  test('V2 negativo: package.json con @x402-xec/core del registro -> falla', () => {
    const pkg = clone(PKG);
    pkg.dependencies['@x402-xec/core'] = '0.1.0';
    expect(lockOnly(LOCK, pkg), /V2: package\.json @x402-xec\/core = 0\.1\.0/);
  });
  test('V2 negativo: sin overrides de zod/ecashaddrjs -> falla', () => {
    const pkg = clone(PKG);
    delete pkg.overrides.zod;
    delete pkg.overrides.ecashaddrjs;
    const p = lockOnly(LOCK, pkg);
    expect(p, /V2: overrides\.zod = \(ausente\)/);
    expect(p, /V2: overrides\.ecashaddrjs = \(ausente\)/);
  });
  test('V4/V5 negativo (P2-L7): zod 4.6.5 en el lock -> falla', () => {
    const lock = clone(LOCK);
    Object.assign(lock.packages['node_modules/zod'], { version: '4.6.5', integrity: 'sha512-v5l/aFXZQeai4awLbOpSoHe' });
    expect(lockOnly(lock), /V4: node_modules\/zod = 4\.6\.5/);
  });
  test('V5 negativo (P2-L7): dos zod en el lock (4.4.3 + 4.6.5 anidado) -> falla', () => {
    const lock = clone(LOCK);
    lock.packages['node_modules/@x402-xec/core/node_modules/zod'] = { version: '4.6.5', integrity: 'sha512-v5l' };
    expect(lockOnly(lock), /V5: zod debe aparecer exactamente una vez en el lockfile \(hay 2/);
  });
  test('V4 negativo: ecashaddrjs 2.0.3 (deriva observada el 2026-10-15 sin override) -> falla', () => {
    const lock = clone(LOCK);
    Object.assign(lock.packages['node_modules/ecashaddrjs'], { version: '2.0.3', integrity: 'sha512-q1kc' });
    expect(lockOnly(lock), /V4: node_modules\/ecashaddrjs = 2\.0\.3/);
  });
  test('V1 negativo: tarball alterado (1 byte) -> falla', () => {
    const vendorDir = path.join(TMP, 'v1');
    cpSync(path.join(PACKAGE_ROOT, VENDOR_REL), vendorDir, { recursive: true });
    const f = path.join(vendorDir, 'x402-xec-core-0.1.0.tgz');
    const b = readFileSync(f); b[b.length - 1] ^= 1; writeFileSync(f, b);
    expect(checkVendor({ vendorDir, checkInstalled: false }), /V1: SHA-256 de x402-xec-core-0\.1\.0\.tgz/);
  });
  test('V1 negativo: SHA256SUMS con un tarball de más -> falla', () => {
    const vendorDir = path.join(TMP, 'v1b');
    cpSync(path.join(PACKAGE_ROOT, VENDOR_REL), vendorDir, { recursive: true });
    writeFileSync(path.join(vendorDir, 'SHA256SUMS'), readFileSync(path.join(vendorDir, 'SHA256SUMS'), 'utf8') + `${'0'.repeat(64)}  extra.tgz\n`);
    expect(checkVendor({ vendorDir, checkInstalled: false }), /V1: SHA256SUMS lista/);
  });
  test('V6 negativo: segundo zod instalado y @noble/hashes como symlink -> falla', () => {
    const root = path.join(TMP, 'v6');
    mkdirSync(root, { recursive: true });
    for (const f of ['package.json', 'package-lock.json', 'vendor']) cpSync(path.join(PACKAGE_ROOT, f), path.join(root, f), { recursive: true });
    const nm = path.join(root, 'node_modules');
    cpSync(path.join(PACKAGE_ROOT, 'node_modules'), nm, { recursive: true });
    cpSync(path.join(nm, 'zod'), path.join(nm, '@x402-xec', 'core', 'node_modules', 'zod'), { recursive: true });
    rmSync(path.join(nm, '@noble', 'hashes'), { recursive: true });
    symlinkSync(path.join(PACKAGE_ROOT, 'node_modules', '@noble', 'hashes'), path.join(nm, '@noble', 'hashes'), 'dir');
    const p = checkVendor({ packageRoot: root, checkInstalled: true });
    expect(p, /V6: zod instalado 2 veces/);
    expect(p, /V6: node_modules\/@noble\/hashes es un symlink/);
  });
});
