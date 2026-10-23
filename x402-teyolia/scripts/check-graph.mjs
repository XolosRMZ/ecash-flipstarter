#!/usr/bin/env node
// T-11a / T-11b / T-11c sobre el bundle x402 (plan v1.0 §4.5; Auditor P-4/L2).
//   T-11a: grafo de imports desde dist/main.js, siguiendo imports estáticos Y dinámicos
//          (incluido `import('./server.js')`). Solo se admiten: archivos propios del paquete,
//          node:* enumerados (scripts/t11-blocklist.json) y paquetes del cierre de
//          producción del package-lock.json propio (no un comodín). Además, la fase 1
//          (cierre estático de main.js) no puede cargar ningún paquete: Express solo
//          después del guard.
//   T-11b: búsqueda de la lista negativa (scripts/t11-blocklist.json) en los archivos propios
//          del grafo.
//   T-11c: cruce con el inventario del commit exacto: ningún módulo marcado (directo o
//          transitivo) aparece en el grafo, ni por ruta real ni como copia (sufijo de ruta).
//   PR-2b C4 (dictamen PR-2 P2-L4; I-4): en paquetes también se siguen `import`/`export … from`
//          e `import()` (ESM), resueltos con condiciones ESM ["node","import","default"] (no con
//          createRequire); `import()` no literal, `import.meta.resolve`, `module.register` y la
//          generación de código (`Function`, `eval`) son sitios que solo pasan con excepción revisada.
//          `--surface vendor` recorre la superficie vendorizada (scripts/vendor-surface.mjs).
// Uso: node scripts/check-graph.mjs [dist/main.js | --surface vendor]

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './lib/js-lexer.mjs';
import { INVENTORY_FILE, PACKAGE_ROOT, REPO_ROOT, parseInventory } from './inventory.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BLOCKLIST = JSON.parse(readFileSync(path.join(HERE, 't11-blocklist.json'), 'utf8'));
const LEGACY_SRC = path.join(REPO_ROOT, 'backend', 'src');
const RESOLVE_EXT = ['.js', '.mjs', '.cjs', '.json', '.ts', '.mts', '.cts'];
// PR-2 commit 1 (L1P-L3, PR1-L5): lista revisada de excepciones de paquetes. Cada entrada
// lleva paquete, versión, archivo:línea, especificador, SHA-256 del archivo y justificación.
// Una entrada que ya no coincide (n7) o que no aparece en el grafo (n8) hace fallar T-11a.
export const EXCEPTIONS_FILE = path.join(HERE, 't11-optional-absent.json');
export function loadExceptions(file = EXCEPTIONS_FILE) {
  return JSON.parse(readFileSync(file, 'utf8')).entries ?? [];
}
// Cargadores opacos dentro de paquetes (recomendación del Auditor sobre PR1-L5).
// P2-L3 (n3c): createRequire también precedido de punto (module.createRequire, Module.createRequire).
// P2a-L2 (dictamen PR-2a §2.1, propuesta del Auditor): los internos de Module `_load`, `_resolveFilename`
// y `_compile` como identificador en cualquier posición (punto con espacios, alias, desestructuración)
// o como clave entre corchetes, y `mainModule` como palabra (también process['mainModule']).
// Falsos positivos (métodos propios `_load`, strings) fallan cerrado y se resuelven en la lista revisada.
const PACKAGE_OPAQUE = [
  /(?<![\w$])module\.require\s*\(/g,
  /(?<![\w$])createRequire\b/g,
  /(?<![\w$])(?:_load|_resolveFilename|_compile)\b/g,
  /\[\s*(['"`])(?:_load|_resolveFilename|_compile|mainModule)\1\s*\]/g,
  /\bmainModule\b/g,
];
// PR-2b C4: cargadores ESM opacos y generación de código desde strings (sitios en paquetes).
const PACKAGE_ESM_OPAQUE = [
  /import\.meta\.resolve\s*\(/g,
  /(?<![\w$])(?:module|Module|nodeModule)\s*\.\s*register(?:Hooks)?\s*\(/g,
  /(?<![\w$.])registerHooks\s*\(/g,
];
// Sobre el código con strings (el especificador es un string): import { register } de node:module.
const PACKAGE_ESM_OPAQUE_SPEC = [/import\s*\{[^}]*\bregister(?:Hooks)?\b[^}]*\}\s*from\s*['"](?:node:)?module['"]/g];
const PACKAGE_CODEGEN = [
  /(?<![\w$.])(?:new\s+)?Function\s*\(/g,
  /(?<![\w$.])(?:globalThis|global|window|self)\s*\.\s*Function\b/g,
  /=\s*Function\b(?!\s*[.(\w$])/g,
  /(?<![\w$.])eval\s*\(/g,
  /[:=,(]\s*eval\b(?!\s*[(\w$])/g,
  // Codex #64 r4295643573: formas indirectas de Function/eval. Invocación con ?.() (eval?.(src)),
  // .call(/.apply( invocados y .bind (Function.call(null, src)); `Function.call.bind(f)` (idioma de
  // uncurry, iconv-lite) no construye código y no cuenta; new Function sin paréntesis y Function como
  // argumento (Reflect.construct(Function, [...]); eval como argumento ya lo cubre la regla anterior).
  /(?<![\w$.])(?:Function|eval)\s*\?\.\s*\(/g,
  /(?<![\w$.])(?:Function|eval)\s*(?:\?\.|\.)\s*(?:(?:call|apply)\s*(?:\?\.\s*)?\(|bind\b)/g,
  /(?<![\w$.])new\s+Function\b(?!\s*\()/g,
  /[,(]\s*Function\b(?!\s*(?:[.(\w$]|\?\.))/g,
];
export const ESM_CONDITIONS = ['node', 'import', 'default'];
export const SURFACES = { vendor: 'scripts/vendor-surface.mjs' };

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function packageNameOf(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Directorio del paquete `name` visible desde `fromFile` (algoritmo de node_modules ascendente). */
function findPackageDir(name, fromFile) {
  let dir = path.dirname(fromFile);
  for (;;) {
    if (path.basename(dir) !== 'node_modules') {
      const c = path.join(dir, 'node_modules', name);
      if (existsSync(path.join(c, 'package.json'))) return c;
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/**
 * Resolución ESM (I-4): `exports` con condiciones ESM, patrones `*`, y `main` legado si no hay
 * `exports`. Sin NODE_PATH ni carpetas globales (ESM no las usa). Devuelve null si no resuelve.
 * Los especificadores `#…` (campo `imports`) no se admiten: quien los use falla cerrado.
 */
/** PATTERN_KEY_COMPARE de Node (resolve.js, patternKeyCompare): -1 si `a` va antes que `b`. */
export function patternKeyCompare(a, b) {
  const ai = a.indexOf('*');
  const bi = b.indexOf('*');
  const baseA = ai === -1 ? a.length : ai + 1;
  const baseB = bi === -1 ? b.length : bi + 1;
  if (baseA > baseB) return -1;
  if (baseB > baseA) return 1;
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  if (a.length > b.length) return -1;
  if (b.length > a.length) return 1;
  return 0;
}

export function resolveEsm(spec, fromFile, conditions = ESM_CONDITIONS) {
  if (spec.startsWith('#')) return null;
  const name = packageNameOf(spec);
  const subpath = `.${spec.slice(name.length)}`;
  const pkgDir = findPackageDir(name, fromFile);
  if (!pkgDir) return null;
  const pj = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const isFile = (f) => existsSync(f) && statSync(f).isFile();
  const pick = (t, star) => {
    if (typeof t === 'string') return star === null ? t : t.replaceAll('*', star);
    if (Array.isArray(t)) { for (const x of t) { const r = pick(x, star); if (r) return r; } return null; }
    if (t && typeof t === 'object') { for (const [c, v] of Object.entries(t)) if (conditions.includes(c)) { const r = pick(v, star); if (r) return r; } }
    return null;
  };
  if (pj.exports !== undefined && pj.exports !== null) {
    let map = pj.exports;
    if (typeof map === 'string' || Array.isArray(map) || !Object.keys(map).some((k) => k.startsWith('.'))) map = { '.': map };
    let t = null;
    // Codex #64 r4295643556: misma elección que packageExportsResolve de Node 22.13.1
    // (lib/internal/modules/esm/resolve.js): coincidencia exacta solo si la clave no tiene `*` y el
    // subpath tampoco; si no, entre claves con un solo `*` cuyo prefijo y sufijo coinciden y con
    // subpath.length >= key.length, gana la menor según patternKeyCompare.
    if (Object.hasOwn(map, subpath) && !subpath.includes('*')) t = pick(map[subpath], null);
    else {
      let bestKey = '';
      let bestStar = null;
      for (const k of Object.keys(map)) {
        const i = k.indexOf('*');
        if (i === -1 || k.lastIndexOf('*') !== i) continue;
        const pre = k.slice(0, i);
        const post = k.slice(i + 1);
        if (subpath.startsWith(pre) && subpath.length >= k.length && subpath.endsWith(post) && patternKeyCompare(bestKey, k) === 1) {
          bestKey = k;
          bestStar = subpath.slice(pre.length, subpath.length - post.length);
        }
      }
      if (bestKey) t = pick(map[bestKey], bestStar);
    }
    if (!t) return null;
    const f = path.join(pkgDir, t);
    return isFile(f) ? f : null;
  }
  if (subpath === '.') {
    const main = pj.main ?? 'index.js';
    for (const c of [main, `${main}.js`, `${main}.json`, path.join(main, 'index.js'), 'index.js']) if (isFile(path.join(pkgDir, c))) return path.join(pkgDir, c);
    return null;
  }
  const f = path.join(pkgDir, subpath);
  return isFile(f) ? f : null;
}

/** Cierre de producción del lockfile v3: entradas sin `dev: true`. */
export function lockfileClosure(lockPath) {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const root = lock.packages?.[''] ?? {};
  const entries = new Map();
  for (const [key, meta] of Object.entries(lock.packages ?? {})) {
    if (key === '' || meta.dev) continue;
    entries.set(key, meta);
  }
  return {
    lockDir: path.dirname(lockPath),
    directDeps: new Set(Object.keys(root.dependencies ?? {})),
    entries,
    names: new Set([...entries.keys()].map((k) => k.slice(k.lastIndexOf('node_modules/') + 'node_modules/'.length))),
  };
}

function resolveRelative(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, ...RESOLVE_EXT.map((e) => base + e), ...RESOLVE_EXT.map((e) => path.join(base, `index${e}`))];
  if (/\.[cm]?js$/.test(base)) {
    const stem = base.replace(/\.[cm]?js$/, '');
    candidates.push(...['.ts', '.mts', '.cts', '.tsx'].map((e) => stem + e));
  }
  for (const c of candidates) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

/** Extrae imports de un archivo propio. Falla cerrado ante cargas no literales u opacas. */
function scanOwnFile(code) {
  const edges = [];
  const problems = [];
  const staticRes = [
    /(?:^|[;\n}])\s*import\s+(?:[\w$*{}\s,]+?\s+from\s+)?(['"])([^'"\n]+)\1/g,
    /(?:^|[;\n}])\s*export\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s+(['"])([^'"\n]+)\1/g,
  ];
  for (const re of staticRes) for (const m of code.matchAll(re)) edges.push({ spec: m[2], dynamic: false, esm: true });
  for (const m of code.matchAll(/(?<![\w$.])import\s*\(/g)) {
    const rest = code.slice(m.index + m[0].length);
    const lit = /^\s*(['"])([^'"\n]+)\1\s*[),]/.exec(rest);
    if (lit) edges.push({ spec: lit[2], dynamic: true, esm: true });
    else problems.push('import() dinámico con especificador no literal');
  }
  for (const needle of BLOCKLIST.opaqueLoaders) {
    if (code.includes(needle)) problems.push(`carga de código opaca: ${needle}`);
  }
  return { edges, problems };
}

function lineAt(code, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (code.charCodeAt(i) === 10) n++;
  return n;
}

function scanPackageFile(code, bare) {
  const edges = [];
  const warnings = [];
  const sites = [];
  // `bare`: el mismo código con strings/regex vaciados (para no confundir texto con código).
  bare ??= code;
  for (const m of code.matchAll(/(?<![\w$.])require\s*\(\s*([^)]*)\)/g)) {
    const lit = /^\s*(['"])([^'"\n]+)\1\s*$/.exec(m[1]);
    if (lit) edges.push({ spec: lit[2], dynamic: false, line: lineAt(code, m.index) });
    else {
      warnings.push('require no literal');
      sites.push({ kind: 'require-no-literal', line: lineAt(code, m.index), spec: m[1].trim() });
    }
  }
  for (const re of PACKAGE_OPAQUE) {
    for (const m of code.matchAll(re)) sites.push({ kind: 'opaque', line: lineAt(code, m.index), spec: m[0].replace(/\s*\($/, '') });
  }
  const esmStatic = [
    /(?:^|[;\n}])\s*import\s+(?:[\w$*{}\s,]+?\s+from\s+)?(['"])([^'"\n]+)\1/g,
    /(?:^|[;\n}])\s*export\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(['"])([^'"\n]+)\1/g,
  ];
  for (const re of esmStatic) for (const m of code.matchAll(re)) edges.push({ spec: m[2], dynamic: false, esm: true, line: lineAt(code, m.index + m[0].search(/\S/)) });
  for (const m of bare.matchAll(/(?<![\w$.])import\s*\(/g)) {
    const rest = code.slice(m.index + m[0].length);
    const lit = /^\s*(['"])([^'"\n]+)\1\s*[),]/.exec(rest);
    if (lit) edges.push({ spec: lit[2], dynamic: true, esm: true, line: lineAt(code, m.index) });
    else sites.push({ kind: 'import-no-literal', line: lineAt(code, m.index), spec: rest.slice(0, rest.search(/[)\n]/)).trim() });
  }
  for (const re of PACKAGE_ESM_OPAQUE) for (const m of bare.matchAll(re)) sites.push({ kind: 'opaque', line: lineAt(code, m.index), spec: m[0].replace(/\s*\($/, '').replace(/\s+/g, ' ').slice(0, 60) });
  for (const re of PACKAGE_ESM_OPAQUE_SPEC) for (const m of code.matchAll(re)) sites.push({ kind: 'opaque', line: lineAt(code, m.index), spec: m[0].replace(/\s+/g, ' ').slice(0, 60) });
  for (const re of PACKAGE_CODEGEN) for (const m of bare.matchAll(re)) sites.push({ kind: 'codegen', line: lineAt(code, m.index + m[0].search(/[\w$]/)), spec: m[0].replace(/\s*\($/, '').replace(/\s+/g, ' ') });
  return { edges, warnings, sites };
}

/**
 * Construye el grafo desde `entry`.
 * opts.ownRoot: raíz de los archivos propios (por defecto PACKAGE_ROOT).
 * opts.lock: resultado de lockfileClosure() (por defecto el lockfile propio).
 */
export function buildGraph(entry, opts = {}) {
  // L1P-L3: realpath en la entrada, en la raíz propia y en la raíz de contención.
  const realOrSelf = (p) => { try { return realpathSync(p); } catch { return path.resolve(p); } };
  const ownRoot = realOrSelf(opts.ownRoot ?? PACKAGE_ROOT);
  const containRoot = realOrSelf(opts.containRoot ?? PACKAGE_ROOT);
  const lock = opts.lock ?? lockfileClosure(path.join(PACKAGE_ROOT, 'package-lock.json'));
  // Cada excepción pertenece a una superficie (main por defecto; vendor para --surface vendor):
  // así n8 (obsoleta) se evalúa contra el grafo al que pertenece.
  const surface = opts.surface ?? 'main';
  const exceptions = (opts.exceptions ?? loadExceptions()).filter((e) => (e.surface ?? 'main') === surface);
  const usedExceptions = new Set();
  const externalSpecs = new Set();
  const nodes = new Map();
  const problems = [];
  const entryAbs = realOrSelf(entry);
  const queue = [{ file: entryAbs, phase1: true, from: null }];

  const addProblem = (msg) => { if (!problems.includes(msg)) problems.push(msg); };
  const pkgInfo = (node) => {
    if (node.pkgInfo) return node.pkgInfo;
    const segs = node.file.split(path.sep);
    const idx = segs.lastIndexOf('node_modules');
    const n = segs[idx + 1]?.startsWith('@') ? 2 : 1;
    const pkgDir = segs.slice(0, idx + 1 + n).join(path.sep);
    let version = null;
    try { version = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version; } catch { /* falla abajo */ }
    node.pkgInfo = { pkgDir, version, rel: toPosix(path.relative(pkgDir, node.file)) };
    return node.pkgInfo;
  };
  // Sitio en un paquete que solo se admite si está en la lista revisada (n7: debe coincidir).
  const checkSite = (node, site) => {
    const info = pkgInfo(node);
    const where = `${node.pkg}@${info.version}:${info.rel}:${site.line}`;
    const idx = exceptions.findIndex((e) => e.package === node.pkg && e.file === info.rel && e.line === site.line && e.kind === site.kind && e.spec === site.spec);
    if (idx < 0) {
      addProblem(`T-11a: ${site.kind} no revisado en ${where} (${site.spec})`);
      return false;
    }
    const e = exceptions[idx];
    usedExceptions.add(idx);
    const sha = createHash('sha256').update(readFileSync(node.file)).digest('hex');
    if (e.version !== info.version || e.sha256 !== sha) {
      addProblem(`T-11a: excepción que ya no coincide (versión o SHA-256) en ${where}`);
      return false;
    }
    // codegen por alias (`const F = Function` … `new F(…)`): la línea de construcción registrada
    // debe contener la construcción; si cambia, la excepción deja de coincidir.
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (e.constructLine !== undefined && !(e.alias && new RegExp(`(?<![\\w$.])(?:new\\s+)?${esc(e.alias)}\\s*\\(`).test(node.raw.split('\n')[e.constructLine - 1] ?? ''))) {
      addProblem(`T-11a: excepción que ya no coincide (constructLine ${e.constructLine}) en ${where}`);
      return false;
    }
    return true;
  };

  while (queue.length > 0) {
    const { file, phase1 } = queue.shift();
    const existing = nodes.get(file);
    if (existing) {
      if (phase1 && !existing.phase1) {
        existing.phase1 = true;
        if (existing.kind === 'package') addProblem(`T-11a fase 1: el paquete ${existing.pkg} se carga antes del guard (import estático desde main)`);
        for (const e of existing.edges) if (!e.dynamic && e.resolved) queue.push({ file: e.resolved, phase1: true });
      }
      continue;
    }
    const inNodeModules = file.split(path.sep).includes('node_modules');
    const own = !inNodeModules && isInside(file, ownRoot);
    const legacy = isInside(file, LEGACY_SRC);
    const node = { file, kind: own ? 'own' : inNodeModules ? 'package' : 'outside', phase1, edges: [], builtins: new Set(), warnings: [] };
    nodes.set(file, node);
    // Regla de contención (se suma a la clave del lockfile y a la versión, no las sustituye).
    if (!isInside(file, containRoot)) addProblem(`T-11a: resuelto fuera del paquete: ${toPosix(path.relative(REPO_ROOT, file))}`);

    if (node.kind === 'outside') {
      addProblem(`T-11a: módulo fuera del paquete x402: ${toPosix(path.relative(REPO_ROOT, file))}${legacy ? ' (backend legacy)' : ''}`);
      continue;
    }
    if (node.kind === 'package') {
      const segs = file.split(path.sep);
      const idx = segs.lastIndexOf('node_modules');
      const nameParts = segs[idx + 1]?.startsWith('@') ? segs.slice(idx + 1, idx + 3) : segs.slice(idx + 1, idx + 2);
      node.pkg = nameParts.join('/');
      const pkgDir = segs.slice(0, idx + 1 + nameParts.length).join(path.sep);
      const lockKey = toPosix(path.relative(lock.lockDir, pkgDir));
      const meta = lock.entries.get(lockKey);
      if (!meta) addProblem(`T-11a: paquete fuera del cierre de producción del lockfile: ${lockKey}`);
      else {
        try {
          const installed = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version;
          if (installed !== meta.version) addProblem(`T-11a: versión instalada de ${lockKey} (${installed}) distinta del lockfile (${meta.version})`);
        } catch {
          addProblem(`T-11a: no se pudo leer package.json de ${lockKey}`);
        }
      }
      if (phase1) addProblem(`T-11a fase 1: el paquete ${node.pkg} se carga antes del guard (import estático desde main)`);
      if (file.endsWith('.json')) continue;
    }

    let code;
    try {
      code = stripComments(readFileSync(file, 'utf8'));
    } catch {
      addProblem(`T-11a: no se pudo leer ${toPosix(path.relative(REPO_ROOT, file))}`);
      continue;
    }
    node.raw = readFileSync(file, 'utf8');
    const scan = node.kind === 'own' ? scanOwnFile(code) : scanPackageFile(code, stripComments(node.raw, { blankStrings: true }));
    if (node.kind === 'own') for (const p of scan.problems) addProblem(`T-11a: ${p} en ${toPosix(path.relative(REPO_ROOT, file))}`);
    else {
      node.warnings.push(...scan.warnings);
      for (const site of scan.sites) checkSite(node, site);
    }

    for (const edge of scan.edges) {
      const spec = edge.spec;
      if (spec.startsWith('node:') || isBuiltin(spec)) {
        node.builtins.add(spec);
        if (node.kind === 'own') {
          if (!spec.startsWith('node:')) addProblem(`T-11a: builtin sin prefijo node: (${spec}) en archivo propio`);
          else if (!BLOCKLIST.ownBuiltins.includes(spec)) addProblem(`T-11a: builtin no enumerado en archivo propio: ${spec}`);
        }
        node.edges.push({ ...edge, resolved: null, builtin: true });
        continue;
      }
      if (spec.startsWith('.') || spec.startsWith('/')) {
        const target = resolveRelative(file, spec);
        if (!target) {
          addProblem(`T-11a: import no resuelto ${spec} en ${toPosix(path.relative(REPO_ROOT, file))}`);
          node.edges.push({ ...edge, resolved: null });
          continue;
        }
        const real = realpathSync(target);
        node.edges.push({ ...edge, resolved: real });
        queue.push({ file: real, phase1: phase1 && !edge.dynamic });
        continue;
      }
      const name = packageNameOf(spec);
      if (node.kind === 'own' && !lock.directDeps.has(name)) {
        addProblem(`T-11a: paquete no permitido (no es dependencia de producción del lockfile): ${name}`);
        node.edges.push({ ...edge, resolved: null });
        continue;
      }
      let target = null;
      if (spec.startsWith('#')) addProblem(`T-11a: especificador de imports (#) no soportado: ${spec} en ${toPosix(path.relative(REPO_ROOT, file))}`);
      else if (edge.esm) target = resolveEsm(spec, file);
      else {
        try {
          target = createRequire(file).resolve(spec);
        } catch {
          target = null;
        }
      }
      if (node.kind === 'package' && !lock.names.has(name)) {
        externalSpecs.add(name);
        // Antes era aviso si no se resolvía: el veredicto dependía del entorno. Ahora es error
        // siempre, salvo excepción revisada; y aun con excepción, si se resuelve, es error.
        if (target) addProblem(`T-11a: dependencia transitiva fuera del lockfile que SÍ se resuelve (se cargaría desde ${toPosix(path.relative(REPO_ROOT, target))}): ${name}`);
        else if (checkSite(node, { kind: 'optional-absent', line: edge.line, spec: name })) node.warnings.push(`require opcional no instalado, revisado (no se carga): ${name}`);
        continue;
      }
      if (!target) {
        addProblem(`T-11a: no se pudo resolver el paquete ${spec}`);
        continue;
      }
      const real = realpathSync(target);
      node.edges.push({ ...edge, resolved: real });
      queue.push({ file: real, phase1: phase1 && !edge.dynamic });
    }
  }
  exceptions.forEach((e, i) => {
    if (!usedExceptions.has(i)) addProblem(`T-11a: excepción obsoleta (no aparece en el grafo): ${e.package}:${e.file}:${e.line} ${e.kind}`);
  });
  return { entry: entryAbs, surface, ownRoot, containRoot, nodes, problems, externalSpecs, usedExceptions: [...usedExceptions].map((i) => exceptions[i]) };
}

export function checkT11a(graph) {
  return graph.problems.filter((p) => p.startsWith('T-11a'));
}

const ownCount = (graph) => [...graph.nodes.values()].filter((n) => n.kind === 'own').length;

export function checkT11b(graph, blocklist = BLOCKLIST) {
  const hits = [];
  if (ownCount(graph) === 0) hits.push('T-11b: 0 archivos propios en el grafo (verificación vacía)');
  const idRes = blocklist.identifiers.map((id) => [id, new RegExp(`(?<![A-Za-z0-9_$])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_$])`)]);
  const patRes = (blocklist.patterns ?? []).map((p) => [p, new RegExp(p)]);
  for (const node of graph.nodes.values()) {
    if (node.kind !== 'own' || node.raw === undefined) continue;
    const rel = toPosix(path.relative(REPO_ROOT, node.file));
    for (const [id, re] of idRes) if (re.test(node.raw)) hits.push(`T-11b: símbolo prohibido ${id} en ${rel}`);
    for (const p of blocklist.paths) if (node.raw.includes(p)) hits.push(`T-11b: ruta prohibida ${p} en ${rel}`);
    for (const [p, re] of patRes) if (re.test(node.raw)) hits.push(`T-11b: patrón prohibido /${p}/ en ${rel}`);
  }
  return [...new Set(hits)];
}

export function checkT11c(graph, inventoryText) {
  const inv = parseInventory(inventoryText);
  const hits = [];
  if (inv.flagged.size === 0) hits.push('T-11c: el inventario no tiene módulos marcados (¿inventario vacío o ilegible?)');
  if (ownCount(graph) === 0) hits.push('T-11c: 0 archivos propios en el grafo (verificación vacía)');
  for (const node of graph.nodes.values()) {
    const noExt = node.file.replace(/\.(d\.ts|[cm]?[jt]sx?|json)$/, '');
    if (isInside(node.file, LEGACY_SRC)) {
      const id = toPosix(path.relative(LEGACY_SRC, noExt));
      if (inv.flagged.has(id)) hits.push(`T-11c: módulo marcado ${id} [${inv.flagged.get(id).all.join(',')}] en el grafo`);
      continue;
    }
    if (node.kind !== 'own') continue;
    const rel = toPosix(path.relative(graph.ownRoot, noExt));
    for (const [id, info] of inv.flagged) {
      if (!id.includes('/')) continue;
      if (rel === id || rel.endsWith(`/${id}`)) hits.push(`T-11c: copia del módulo marcado ${id} [${info.all.join(',')}] en ${rel}`);
    }
  }
  return [...new Set(hits)];
}

export function summarize(graph) {
  const own = [];
  const pkgs = new Map();
  const builtinsOwn = new Set();
  const builtinsPkg = new Set();
  let dynamicEdges = [];
  const optional = new Set();
  for (const n of graph.nodes.values()) {
    if (n.kind === 'own') {
      own.push(`${toPosix(path.relative(graph.ownRoot, n.file))}${n.phase1 ? ' [fase 1]' : ' [fase 2]'}`);
      n.builtins.forEach((b) => builtinsOwn.add(b));
      for (const e of n.edges) if (e.dynamic) dynamicEdges.push(`${toPosix(path.relative(graph.ownRoot, n.file))} -> import('${e.spec}')`);
    } else if (n.kind === 'package') {
      pkgs.set(n.pkg, (pkgs.get(n.pkg) ?? 0) + 1);
      n.builtins.forEach((b) => builtinsPkg.add(b));
      for (const w of n.warnings) if (w.startsWith('require opcional')) optional.add(`${n.pkg}: ${w}`);
    }
  }
  return {
    own: own.sort(),
    packages: [...pkgs.keys()].sort(),
    builtinsOwn: [...builtinsOwn].sort(),
    builtinsPackages: [...builtinsPkg].sort(),
    dynamicEdges: dynamicEdges.sort(),
    optionalMissing: [...optional].sort(),
  };
}

async function cli(argv) {
  const si = argv.indexOf('--surface');
  const surface = si >= 0 ? argv[si + 1] : 'main';
  if (si >= 0 && !SURFACES[surface]) {
    process.stderr.write(`check-graph: superficie desconocida ${surface}\n`);
    return 2;
  }
  const positional = argv.filter((a, i) => !a.startsWith('--') && !(si >= 0 && i === si + 1));
  const entry = path.resolve(si >= 0 ? path.join(PACKAGE_ROOT, SURFACES[surface]) : positional[0] ?? path.join(PACKAGE_ROOT, 'dist', 'main.js'));
  if (!existsSync(entry)) {
    process.stderr.write(`check-graph: no existe ${entry} (ejecuta npm run build)\n`);
    return 2;
  }
  const graph = buildGraph(entry, { surface });
  const inventoryText = readFileSync(INVENTORY_FILE, 'utf8');
  const a = checkT11a(graph);
  const b = checkT11b(graph);
  const c = checkT11c(graph, inventoryText);
  const s = summarize(graph);
  const out = [];
  out.push(`check-graph: entrada ${toPosix(path.relative(REPO_ROOT, entry))} (superficie ${surface})`);
  out.push(`  archivos propios (${s.own.length}): ${s.own.join(', ')}`);
  out.push(`  imports dinámicos seguidos: ${s.dynamicEdges.join('; ') || '-'}`);
  out.push(`  builtins en archivos propios: ${s.builtinsOwn.join(', ') || '-'}`);
  out.push(`  paquetes alcanzados (${s.packages.length}, todos en el cierre de producción del lockfile): ${s.packages.join(', ')}`);
  out.push(`  builtins usados por paquetes: ${s.builtinsPackages.join(', ') || '-'}`);
  out.push(`  avisos: ${s.optionalMissing.join('; ') || '-'}`);
  out.push(`  excepciones revisadas usadas (${graph.usedExceptions.length}): ${graph.usedExceptions.map((e) => `${e.package}@${e.version}:${e.file}:${e.line} ${e.kind}`).join('; ') || '-'}`);
  out.push(`  T-11a: ${a.length === 0 ? 'OK' : `FALLA (${a.length})`}`);
  out.push(`  T-11b: ${b.length === 0 ? 'OK' : `FALLA (${b.length})`}`);
  out.push(`  T-11c: ${c.length === 0 ? `OK (inventario ${parseInventory(inventoryText).commit}, ${parseInventory(inventoryText).flagged.size} módulos marcados)` : `FALLA (${c.length})`}`);
  for (const p of [...a, ...b, ...c]) out.push(`  - ${p}`);
  process.stdout.write(`${out.join('\n')}\n`);
  return a.length + b.length + c.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => {
    process.stderr.write(`check-graph: error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 2;
  });
}
