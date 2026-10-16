// Sonda de T-11d (PR-2 C1; PR-2b C4). Se copia a la raíz de la copia del paquete y se ejecuta
// como entrada (sin --require ni --import: el guard los rechaza). Registra el hook ESM con
// module.register, importa dist/main.js (guard + fase 2) y después la superficie vendorizada
// (scripts/vendor-surface.mjs), y vuelca con realpath los módulos CJS (Module._cache) y las URL
// file: resueltas por el cargador ESM.
import Module, { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const esmLog = path.join(here, '.t11d-esm.log');
fs.writeFileSync(esmLog, '');
register(pathToFileURL(path.join(here, 'resolve-hook.mjs')).href, { data: { out: esmLog } });
let surfaceError = null;
// PR-3: dist/main.js (fase 2) importa @x402-xec/core/sqlite y por tanto zod; si la copia no lo
// tiene, el enlace falla. Se captura para que la sonda siga reportando la resolución (d-n4).
let mainError = null;
try {
  await import(pathToFileURL(path.join(here, 'dist', 'main.js')).href);
} catch (err) {
  mainError = String(err?.message ?? err);
}
try {
  const { loadVendorSurface } = await import(pathToFileURL(path.join(here, 'scripts', 'vendor-surface.mjs')).href);
  const s = await loadVendorSurface();
  if (typeof s.express.createX402SettlementMiddleware !== 'function' || typeof s.sqlite.InMemorySqliteAuthoritativeInvoiceStore !== 'function') surfaceError = 'superficie incompleta';
} catch (err) {
  surfaceError = String(err?.message ?? err);
}
const prefixLibNode = path.join(path.resolve(process.execPath, '..', '..'), 'lib', 'node');
const esm = [...new Set(fs.readFileSync(esmLog, 'utf8').split('\n').filter((u) => u.startsWith('file:')).map((u) => fs.realpathSync(fileURLToPath(u))))];
const report = {
  exitCode: process.exitCode ?? 0,
  surfaceError,
  mainError,
  cache: Object.keys(Module._cache).map((f) => fs.realpathSync(f)),
  esm,
  globalPaths: Module.globalPaths,
  prefixLibNode,
  prefixLibNodeExists: fs.existsSync(prefixLibNode),
};
process.stdout.write(`T11D ${JSON.stringify(report)}\n`);
process.exit(report.exitCode || (surfaceError || mainError ? 1 : 0));
