// M5-V1 / OB-07 / RQ-14, opción A (Fernando, 2026-10-23 14:16 CDMX): identidad del dist/ para
// `/teyolia-x402/health` (`commit` y `distManifestSha256` en el nivel superior).
//
// VALOR DECLARADO, NO MEDIDO. El proceso lee `dist/build-info.json`, que escribe el build
// (scripts/dist-manifest.mjs --build), y valida su forma. NO recalcula el manifiesto del dist/ en
// disco: un dist/*.js alterado con el build-info.json intacto seguiría reportando el hash original.
// Residual documentado (dictamen de la tabla PT, PT5-04 (iv)). Fernando (2026-10-23 17:39) no adopta
// por ahora el recálculo al arrancar: la verificación vinculante es M5-V1 por rebuild determinista y
// comparación en CI (`npm run check:dist`) y, en mx2, la evidencia M5 externa que hashea los archivos
// de dist/ sin fiarse del health, antes de TA-3 o de la reconexión.
//
// Conjunto cubierto (definido en scripts/dist-manifest.mjs): todo archivo regular de dist/ salvo los
// archivos de identidad IDENTITY_FILES, que contienen distManifestSha256 o el manifiesto y quedan
// fuera para evitar circularidad.
//
// Falla cerrado: build-info.json ausente, ilegible o con forma inválida (commit que no son 40 hex,
// hash que no son 64 hex, claves distintas, schema distinto de 1) -> { ok: false }. Nunca null.
// Se lee UNA vez: startServer la evalúa antes de abrir la persistencia (exit 78 si no es válida) y
// createApp la usa para el health.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUILD_INFO_FILE = 'build-info.json';
export const MANIFEST_FILE = 'dist-manifest.sha256';
export const IDENTITY_FILES: readonly string[] = Object.freeze([BUILD_INFO_FILE, MANIFEST_FILE]);
export const BUILD_INFO_SCHEMA = 1;
export const BUILD_UNVERIFIED_CODE = 'TEYOLIA_X402_BUILD_UNVERIFIED';
/** false: valor declarado (residual PT5-04 (iv)); el recálculo al arrancar no se adopta (17:39). */
export const RUNTIME_MANIFEST_RECOMPUTED = false;

export type BuildIdentity =
  | { readonly ok: true; readonly commit: string; readonly distManifestSha256: string }
  | { readonly ok: false; readonly reason: string };

export const DEFAULT_DIST_DIR = path.dirname(fileURLToPath(import.meta.url));

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Lee y valida dist/build-info.json. Nunca lanza. */
export function loadBuildIdentity(distDir: string = DEFAULT_DIST_DIR): BuildIdentity {
  let info: unknown;
  try {
    info = JSON.parse(readFileSync(path.join(distDir, BUILD_INFO_FILE), 'utf8'));
  } catch {
    return { ok: false, reason: 'build-info.json ausente o ilegible' };
  }
  if (!isRecord(info) || Object.keys(info).sort().join(',') !== 'commit,distManifestSha256,files,schema'
      || info['schema'] !== BUILD_INFO_SCHEMA
      || typeof info['commit'] !== 'string' || !/^[0-9a-f]{40}$/.test(info['commit'])
      || typeof info['distManifestSha256'] !== 'string' || !/^[0-9a-f]{64}$/.test(info['distManifestSha256'])
      || typeof info['files'] !== 'number' || !Number.isSafeInteger(info['files']) || info['files'] < 1) {
    return { ok: false, reason: 'build-info.json con forma inválida' };
  }
  return { ok: true, commit: info['commit'], distManifestSha256: info['distManifestSha256'] };
}
