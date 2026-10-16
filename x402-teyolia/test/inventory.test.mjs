// Inventario del commit exacto (TA1-M1): archivado, reproducible y completo frente a la
// referencia independiente del Auditor (P-4 I-3: 42 nombres).

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { FIXTURES } from './helpers.mjs';
import { BASE_COMMIT, INVENTORY_FILE, INVENTORY_SHA_FILE, generateInventory, parseInventory } from '../scripts/inventory.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const archived = readFileSync(INVENTORY_FILE, 'utf8');
const inv = parseInventory(archived);

describe('inventario archivado de 239f9dc', () => {
  test('commit base y .sha256', () => {
    assert.equal(inv.commit, BASE_COMMIT);
    assert.equal(BASE_COMMIT, '239f9dc9d64361700b798cebde0f30a0dc368e7b');
    assert.equal(readFileSync(INVENTORY_SHA_FILE, 'utf8'), `${sha(archived)}  239f9dc.inventory.txt\n`);
  });
  test('se regenera idéntico desde backend/src', async () => {
    assert.equal(await generateInventory(), archived);
  });
  test('contiene los 42 nombres de la referencia del Auditor (I-3, sha256 13a61a9e…def9e)', () => {
    const refRaw = readFileSync(path.join(FIXTURES, 'auditor-i3-reference-239f9dc.txt'));
    assert.equal(sha(refRaw), '13a61a9eca9242a2590bfcd524abc2ab77702e9ad5db91eb2cc1d25b359def9e');
    const ref = refRaw.toString('utf8').split('\n').filter(Boolean);
    assert.equal(ref.length, 42);
    for (const n of ref) assert.ok(inv.envNames.has(n), `falta ${n}`);
    assert.equal(inv.envNames.size, 42);
  });
  test('variables I-3 del apéndice delta exigidas por el plan §4.2.8', () => {
    for (const n of ['BENEFICIARY_PUBKEY', 'TEYOLIA_BENEFICIARY_PUBKEY', 'REFUND_ORACLE_PUBKEY', 'GAS_WALLET_ADDRESS', 'TEYOLIA_GAS_WALLET_ADDRESS', 'TEYOLIA_TREASURY_ADDRESS', 'TEYOLIA_ACTIVATION_FEE_XEC', 'ECASH_NETWORK', 'E_CASH_BACKEND']) {
      assert.ok(inv.envNames.has(n), n);
    }
  });
  test('loadDotEnv de server.ts marcado como CANAL; nombres vía resolvePrivateKeyFromEnv', () => {
    assert.match(archived, /^CANAL \| server:44 \| escritura dinámica process\.env\[key\] en loadDotEnv/m);
    assert.match(archived, /^ENV TEYOLIA_REFUND_ORACLE_PRIVKEY \|.*vía resolvePrivateKeyFromEnv/m);
    assert.match(archived, /^NO_LEIDA CORS_ALLOW_DEV_LOCALHOST /m);
  });
  test('marcas de módulos clave', () => {
    const has = (id, mark) => assert.ok(inv.flagged.get(id)?.direct.includes(mark), `${id} ${mark}`);
    has('blockchain/ecashClient', 'TRANSMITE');
    has('blockchain/txBuilder', 'FIRMA');
    has('services/RefundService', 'LEE_LLAVE');
    has('services/CampaignService', 'LEE_LLAVE');
    has('config/env', 'LEE_CREDENCIAL');
    has('config/ecash', 'LEE_CREDENCIAL');
    has('store/db', 'DB_LEGACY');
    has('db/SQLiteStore', 'DB_LEGACY');
    has('server', 'CANAL');
  });
});

describe('el inventario detecta cada patrón (fixture sintético, no vacuo)', () => {
  test('directa, índice literal, desestructurada, por nombre pasado a función, escritura dinámica y marcas', async () => {
    const text = await generateInventory(path.join(FIXTURES, 'inventory-src'));
    const p = parseInventory(text);
    for (const n of ['FIXTURE_RPC_USER', 'FIXTURE_RPC_URL', 'FIXTURE_DESTRUCTURED', 'FIXTURE_SIGNER_PRIVKEY', 'FIXTURE_SIGNER_SEED']) assert.ok(p.envNames.has(n), n);
    assert.match(text, /^ENV FIXTURE_SIGNER_PRIVKEY \|.*vía readNamed/m);
    assert.match(text, /^CANAL \| boot:4 \|/m);
    assert.ok(p.flagged.get('services/sender').direct.includes('TRANSMITE'));
    assert.ok(p.flagged.get('services/keys').direct.includes('FIRMA'));
    assert.ok(p.flagged.get('services/keys').direct.includes('LEE_LLAVE'));
    assert.ok(p.flagged.get('config/net').direct.includes('LEE_CREDENCIAL'));
    assert.ok(p.flagged.get('boot').reached.includes('TRANSMITE'));
  });
});

// PR-2 commit 2 (Auditor PR1-L3): el escáner falla cerrado ante accesos a process.env que no
// reduce a un nombre literal. Fixtures generados en tmp (uno por patrón).
import { mkdirSync as _mk, mkdtempSync as _mkd, rmSync as _rm, writeFileSync as _wf } from 'node:fs';
import { tmpdir as _tmp } from 'node:os';
describe('PR1-L3: escáner de process.env fail-closed', () => {
  const root = _mkd(path.join(_tmp(), 'x402-l3-'));
  process.on('exit', () => _rm(root, { recursive: true, force: true }));
  let k = 0;
  const gen = async (code) => {
    const dir = path.join(root, `c${++k}`);
    _mk(dir, { recursive: true });
    _wf(path.join(dir, 'm.ts'), code);
    return generateInventory(dir);
  };
  const bad = [
    ['alias desestructurado de process', 'const { env } = process;\nexport const a = env.SECRET_A;\n'],
    ['(process as any)[\'env\']', "export const a = (process as any)['env'].SECRET_A;\n"],
    ["process['env']", "export const a = process['env'].SECRET_A;\n"],
    ['globalThis.process', 'export const a = globalThis.process.env.SECRET_A;\n'],
    ["import { env } from 'node:process'", "import { env } from 'node:process';\nexport const a = env.SECRET_A;\n"],
    ['alias de process.env', 'const e = process.env;\nexport const a = e.SECRET_A;\n'],
    ['spread de process.env', 'export const a = { ...process.env };\n'],
    ['Object.keys(process.env)', 'export const a = Object.keys(process.env);\n'],
    ['process como argumento', 'declare function f(x: unknown): void;\nf(process);\n'],
    ["require('process')", "export const a = require('process').env.SECRET_A;\n"],
  ];
  for (const [label, code] of bad) {
    test(`rechaza: ${label}`, async () => {
      await assert.rejects(gen(code), /PR1-L3: .*INDETERMINADO \| m:\d+/s);
    });
  }
  test('no rechaza: strings con "process", process.exit, desestructuración directa de process.env', async () => {
    const text = await gen("export const msg = 'Failed to process payout';\nexport const { A_NAME } = process.env;\nexport const b = process.env.B_NAME;\nexport function q() { process.exit(1); }\n");
    const p = parseInventory(text);
    assert.ok(p.envNames.has('A_NAME') && p.envNames.has('B_NAME'));
  });
  test('backend/src @ 239f9dc no tiene ningún acceso indeterminado: el inventario archivado no cambia', async () => {
    assert.equal(await generateInventory(), archived);
  });
});

// P1 #63 (discussion_r4284080928 y r4284080945): formas de process.env que la extracción no veía
// (hallazgo 1) y desestructuraciones que la exención `} = process.env` dejaba pasar (hallazgo 2).
describe('P1 #63: process.env con ?., espacios/comentarios, corchetes, rest y claves computadas', () => {
  const root = _mkd(path.join(_tmp(), 'x402-p63-'));
  process.on('exit', () => _rm(root, { recursive: true, force: true }));
  let k = 0;
  const gen = async (code) => {
    const dir = path.join(root, `c${++k}`);
    _mk(dir, { recursive: true });
    _wf(path.join(dir, 'm.ts'), code);
    return generateInventory(dir);
  };
  const envLine = (text, name) => text.split('\n').find((l) => l.startsWith(`ENV ${name} |`));
  const marks = (text) => text.split('\n').find((l) => l.startsWith('MODULO m |')).split(' | ')[1];

  // Hallazgo 1: se extraen y marcan (antes: 0 nombres, 0 marcas, 0 indeterminados).
  const extracted = [
    ['process?.env.X', 'export const a = process?.env.WALLET_SEED;\n', 'WALLET_SEED', 'directa', 'LEE_LLAVE'],
    ['process?.env?.X', 'export const a = process?.env?.WALLET_SEED;\n', 'WALLET_SEED', 'directa', 'LEE_LLAVE'],
    ['process . env.X', 'export const a = process . env.RPC_PASSWORD;\n', 'RPC_PASSWORD', 'directa', 'LEE_CREDENCIAL'],
    ['process .env .X con saltos de línea', 'export const a = process\n  .env\n  .RPC_PASSWORD;\n', 'RPC_PASSWORD', 'directa', 'LEE_CREDENCIAL'],
    ['comentarios entre process, punto, env y nombre', 'export const a = process /* c */ . /* c */ env /* c */ . WALLET_SEED; // fin\n', 'WALLET_SEED', 'directa', 'LEE_LLAVE'],
    ['comentario de línea entre process y .env', 'export const a = process // c\n  .env.WALLET_SEED;\n', 'WALLET_SEED', 'directa', 'LEE_LLAVE'],
    ["process?.env?.['X']", "export const a = process?.env?.['WALLET_SEED'];\n", 'WALLET_SEED', 'índice literal', 'LEE_LLAVE'],
    ['process . env [ "X" ]', 'export const a = process . env [ "RPC_PASSWORD" ];\n', 'RPC_PASSWORD', 'índice literal', 'LEE_CREDENCIAL'],
    ['escritura process?.env.X =', "export function w() { process . env.TEYOLIA_SQLITE_PATH = 'x'; }\n", 'TEYOLIA_SQLITE_PATH', 'escritura', 'CANAL'],
    ['desestructuración de process?.env', 'export const { WALLET_SEED } = process?.env;\n', 'WALLET_SEED', 'desestructurada', 'LEE_LLAVE'],
    ['desestructuración con alias y defecto de process . env', "export const { RPC_PASSWORD: p = 'd', X_ONE } = process . env;\n", 'RPC_PASSWORD', 'desestructurada', 'LEE_CREDENCIAL'],
  ];
  for (const [label, code, name, kind, mark] of extracted) {
    test(`extrae y marca: ${label}`, async () => {
      const text = await gen(code);
      const l = envLine(text, name);
      assert.ok(l, `${name} no extraído:\n${text}`);
      assert.match(l, new RegExp(`m:\\d+ \\(${kind}\\)`));
      assert.ok(marks(text).split(',').includes(mark), `falta la marca ${mark}: ${marks(text)}`);
    });
  }
  test('lectura dinámica process?.env[k] -> DINAMICO (no se pierde)', async () => {
    const text = await gen('export function f(k: string) { return process?.env?.[k]; }\n');
    assert.match(text, /DINAMICO \| m:1 \| lectura process\.env\[k\] en f/);
  });

  // Corchetes sobre process y formas no reducibles: fallan cerrado.
  const rejected = [
    ["process['env'].X", "export const a = process['env'].WALLET_SEED;\n"],
    ['process["env"].X', 'export const a = process["env"].WALLET_SEED;\n'],
    ["process?.['env'].X", "export const a = process?.['env'].WALLET_SEED;\n"],
    ["process /* c */ [ 'env' ] .X", "export const a = process /* c */ [ 'env' ] .WALLET_SEED;\n"],
    ['process[`env`].X', 'export const a = process[`env`].WALLET_SEED;\n'],
    ['process["env"] desestructurado', 'export const { WALLET_SEED } = process["env"];\n'],
    ['process?.env sin nombre (alias)', 'const e = process?.env;\nexport const a = e.WALLET_SEED;\n'],
    ['process . env sin nombre (spread)', 'export const a = { ...process . env };\n'],
    ['process.env.$X (nombre no extraíble)', 'export const a = process.env.$WALLET_SEED;\n'],
    // Hallazgo 2: rest, spread y claves computadas en la desestructuración.
    ['const { KNOWN, ...rest } = process.env', 'export const { KNOWN, ...rest } = process.env;\n'],
    ['const { ...rest } = process?.env', 'export const { ...rest } = process?.env;\n'],
    ['let { KNOWN, ...rest } = process . env (multilínea)', 'export let {\n  KNOWN,\n  ...rest\n} = process . env;\n'],
    ['const { [k]: v } = process.env', "const k = 'WALLET_SEED';\nexport const { [k]: v } = process.env;\n"],
    ["const { ['X']: v } = process.env", "export const { ['WALLET_SEED']: v } = process.env;\n"],
    ['const { [`X`]: v } = process.env', 'export const { [`WALLET_SEED`]: v } = process.env;\n'],
    ["const { 'X': v } = process.env (clave entre comillas)", "export const { 'WALLET_SEED': v } = process.env;\n"],
    ['const { A: { B } } = process.env (patrón anidado)', 'export const { A_ONE: { length } } = process.env;\n'],
    ['({ A } = process.env) sin declaración', 'export let A_ONE: string | undefined;\n({ A_ONE } = process.env);\n'],
    ['const { A } = x, { ...r } = process.env', 'declare const x: { A_ONE: string };\nexport const { A_ONE } = x, { ...r } = process.env;\n'],
    ['function f({ ...r } = process.env)', 'export function f({ ...r } = process.env) { return r; }\n'],
    ['const { A = f(1, 2) } = process.env (defecto no reducible)', 'declare function f(a: number, b: number): string;\nexport const { A_ONE = f(1, 2) } = process.env;\n'],
  ];
  for (const [label, code] of rejected) {
    test(`rechaza: ${label}`, async () => {
      await assert.rejects(gen(code), /PR1-L3: .*INDETERMINADO \| m:\d+/s);
    });
  }
  test('mensaje específico para rest/computadas en la desestructuración', async () => {
    await assert.rejects(gen('export const { KNOWN, ...rest } = process.env;\n'), /INDETERMINADO \| m:1 \| desestructuración de process\.env con rest, clave computada o patrón no literal/);
  });
  test('no rechaza: desestructuración simple (con alias, defecto y coma final) sigue exenta y extraída', async () => {
    const text = await gen("export const { A_ONE, B_TWO: b, C_THREE = 'x', } = process.env;\n");
    for (const n of ['A_ONE', 'B_TWO', 'C_THREE']) assert.ok(envLine(text, n)?.includes('(desestructurada)'), n);
  });
  test('no rechaza ni extrae: \'process . env\' dentro de un string y process.exit', async () => {
    const text = await gen("export const s = 'Failed to process . env';\nexport const b = process.exit;\n");
    assert.ok(!/^ENV /m.test(text));
  });
});

// P1 #63 (discussion_r4286391976): acceso al objeto global con encadenamiento opcional y
// variantes equivalentes. Todas fallan cerrado; ninguna se reduce a un nombre.
describe('P1 #63: objeto global (globalThis/global/self/window) y rutas equivalentes a process', () => {
  const root = _mkd(path.join(_tmp(), 'x402-p63g-'));
  process.on('exit', () => _rm(root, { recursive: true, force: true }));
  let k = 0;
  const gen = async (code) => {
    const dir = path.join(root, `c${++k}`);
    _mk(dir, { recursive: true });
    _wf(path.join(dir, 'm.ts'), code);
    return generateInventory(dir);
  };
  const rejected = [];
  for (const g of ['globalThis', 'global', 'self', 'window']) {
    rejected.push(
      [`${g}?.['process']?.env.X`, `export const a = (${g} as any)?.['process']?.env.SECRET_A;\n`],
      [`${g}?.["process"].env.X`, `export const a = (${g} as any)?.["process"].env.SECRET_A;\n`],
      [`${g}?.[\`process\`]?.env?.X`, `export const a = (${g} as any)?.[\`process\`]?.env?.SECRET_A;\n`],
      [`${g}['process'].env.X`, `export const a = (${g} as any)['process'].env.SECRET_A;\n`],
      [`${g}?.process?.env.X`, `export const a = (${g} as any)?.process?.env.SECRET_A;\n`],
      [`${g} /*c*/ ?. \\n [ 'process' ]`, `export const a = (${g} /* c */ ?.\n  [ 'process' ] as any).env.SECRET_A;\n`],
    );
  }
  rejected.push(
    ['globalThis.globalThis?.[…]', "export const a = (globalThis.globalThis as any)?.['process'].env.SECRET_A;\n"],
    ['window.self?.[…]', "export const a = (window.self as any)?.['process'].env.SECRET_A;\n"],
    ['alias const g = globalThis', "const g: any = globalThis;\nexport const a = g?.['process']?.env.SECRET_A;\n"],
    ['{ process } = globalThis', 'const { process: p } = globalThis as any;\nexport const a = p.env.SECRET_A;\n'],
    ['Reflect.get(globalThis, …)', "export const a = (Reflect.get(globalThis, 'process') as any).env.SECRET_A;\n"],
    ['Object.getOwnPropertyDescriptor(globalThis, …)', "export const a = Object.getOwnPropertyDescriptor(globalThis, 'process')!.value.env.SECRET_A;\n"],
    ['x.process?.[\'env\'] (objeto con process como propiedad)', "declare const x: any;\nexport const a = x.process?.['env'].SECRET_A;\n"],
    ['x?.process[k]', "declare const x: any; const k = 'env';\nexport const a = x?.process[k].SECRET_A;\n"],
    ['alias x.process.env', 'declare const x: any;\nconst e = x.process.env;\nexport const a = e.SECRET_A;\n'],
    ['(0, eval)(\'this\')', "export const a = (0, eval)('this').process.env;\n"],
    ['Function(\'return this\')()', "export const a = Function('return this')()['process'];\n"],
    ['escape unicode glob\\u0061lThis', 'export const a = (glob\\u0061lThis as any)?.[\'process\']?.env.SECRET_A;\n'],
  );
  for (const [label, code] of rejected) {
    test(`rechaza: ${label}`, async () => {
      await assert.rejects(gen(code), /PR1-L3: .*INDETERMINADO \| m:\d+/s);
    });
  }
  test('el hallazgo exacto de Codex da la etiqueta de objeto global', async () => {
    await assert.rejects(gen("export const a = (globalThis as any)?.['process']?.env.SECRET_A;\n"), /INDETERMINADO \| m:1 \| objeto global \(globalThis\/global\/self\/window\)/);
  });
  test('no rechaza: propiedades llamadas self/global/window y strings que las mencionan', async () => {
    const text = await gen("declare const o: any;\nexport const s = 'globalThis window self';\nexport const n = o.self + o?.global + o.window;\nexport const b = process.env.B_NAME;\n");
    assert.match(text, /^ENV B_NAME \|/m);
  });
});
