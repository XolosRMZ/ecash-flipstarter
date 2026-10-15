// Hook de resolución de T-11d (PR-2b C4; dictamen PR-2 P2-L4). Lo registra la sonda con
// module.register (no por --import/--loader, que el guard rechaza). Anota cada URL resuelta
// por el cargador ESM; los módulos CJS se siguen observando por Module._cache.
import { appendFileSync } from 'node:fs';

let out = null;
export async function initialize(data) {
  out = data.out;
}
export async function resolve(specifier, context, next) {
  const r = await next(specifier, context);
  if (out) appendFileSync(out, `${r.url}\n`);
  return r;
}
