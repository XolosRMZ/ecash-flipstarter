// Sonda de T-11d (PR-2 commit 1). Se copia a la raíz de la copia del paquete y se ejecuta
// como entrada (sin --require ni --import: el guard los rechaza). Importa dist/main.js
// (guard + fase 2) y vuelca los módulos CJS cargados con su realpath.
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(path.join(here, 'dist', 'main.js')).href);
const prefixLibNode = path.join(path.resolve(process.execPath, '..', '..'), 'lib', 'node');
const report = {
  exitCode: process.exitCode ?? 0,
  cache: Object.keys(Module._cache).map((f) => fs.realpathSync(f)),
  globalPaths: Module.globalPaths,
  prefixLibNode,
  prefixLibNodeExists: fs.existsSync(prefixLibNode),
};
process.stdout.write(`T11D ${JSON.stringify(report)}\n`);
process.exit(report.exitCode);
