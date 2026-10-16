// Codex #64 r4295643556 (P1): resolveEsm elige el patrón de `exports` con el orden exacto de Node
// (patternKeyCompare: prefijo más largo; luego clave sin `*`; luego clave más larga), verificado
// contra el resolver real del mismo Node (import.meta.resolve en un proceso hijo y require.resolve).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { patternKeyCompare, resolveEsm } from '../scripts/check-graph.mjs';

const CASES = [
  [{ './a/*': './p1/*.js', './a/b*': './p2/*.js' }, ['./a/bx', './a/b', './a/c', './a/bb']],
  [{ './a/*': './p1/*.js', './a/*.js': './p2/*.js' }, ['./a/x.js', './a/x', './a/.js']],
  [{ './a/*.js': './p1/*.js', './a/*s': './p2/*.js' }, ['./a/x.js', './a/xs']],
  [{ './a/*': './p1/*.js', './a/x': './p2/x.js' }, ['./a/x', './a/y']],
  [{ './*': './p1/*.js', './a/*': './p2/*.js', './a/b/*': './p3/*.js' }, ['./a/b/c', './a/c', './z']],
  [{ './a*z': './p1/*.js', './a*': './p2/*.js', './ab*': './p3/*.js' }, ['./abz', './abcz', './ab', './az', './a']],
  [{ './x/*/y/*': './p1/*.js', './x/*': './p2/*.js' }, ['./x/1/y/2', './x/1']],
  [{ './*.js': './p1/*.js', './*': './p2/*.js' }, ['./q.js', './q']],
  [{ './a/*.js': './p1/*.js', './a/*.mjs': './p2/*.js', './a/*': './p3/*.js' }, ['./a/k.js', './a/k.mjs', './a/k']],
  [{ './a/b*': './p1/*.js', './a/*': './p2/*.js' }, ['./a/b', './a/bc']],
];

describe('Codex #64 r4295643556: orden PATTERN_KEY_COMPARE en exports', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'x402-c64e-'));
  process.on('exit', () => rmSync(root, { recursive: true, force: true }));
  test('patternKeyCompare: prefijo más largo, luego sin *, luego más larga', () => {
    assert.equal(patternKeyCompare('./a/b*', './a/*'), -1);
    assert.equal(patternKeyCompare('./a/*', './a/b*'), 1);
    assert.equal(patternKeyCompare('./a/*', './a/*.js'), 1);
    assert.equal(patternKeyCompare('./a/*.mjs', './a/*.js'), -1);
    assert.equal(patternKeyCompare('./a/*.js', './a/*s'), -1);
    assert.equal(patternKeyCompare('', './a/*'), 1);
    assert.equal(patternKeyCompare('./a/*', './a/*'), 0);
  });
  let i = 0;
  for (const [exp, subs] of CASES) {
    const dir = path.join(root, `c${++i}`);
    const pkg = path.join(dir, 'node_modules', 'pk');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'pk', version: '1.0.0', type: 'module', exports: exp }));
    // Se materializan todos los destinos posibles: la existencia del archivo no decide la elección.
    for (const sub of subs) for (const [k, v] of Object.entries(exp)) {
      const s = k.indexOf('*');
      const star = s < 0 ? null : sub.slice(s, sub.length - (k.length - s - 1));
      if (star === '') continue;
      const f = path.join(pkg, star === null ? v : v.replaceAll('*', star));
      mkdirSync(path.dirname(f), { recursive: true });
      writeFileSync(f, '');
    }
    const from = path.join(dir, 'from.mjs');
    writeFileSync(from, 'try { console.log(new URL(import.meta.resolve(process.argv[2])).pathname); } catch (e) { console.log(`ERR ${e.code}`); }\n');
    for (const sub of subs) {
      const spec = `pk${sub.slice(1)}`;
      test(`${Object.keys(exp).join(' ')} :: ${spec} = Node real`, () => {
        const esm = execFileSync(process.execPath, [from, spec], { encoding: 'utf8' }).trim();
        let cjs; try { cjs = createRequire(from).resolve(spec); } catch (e) { cjs = `ERR ${e.code}`; }
        const mine = resolveEsm(spec, from) ?? 'ERR';
        assert.equal(esm.startsWith('ERR') ? 'ERR' : esm, mine);
        assert.equal(cjs.startsWith('ERR') ? 'ERR' : cjs, mine);
      });
    }
  }
  // Caso exacto del hilo: './*' declarado antes que './*.js' (ambos con prefijo './').
  const exact = (tag, files) => {
    const dir = path.join(root, tag);
    const pkg = path.join(dir, 'node_modules', 'pk');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'pk', version: '1.0.0', type: 'module', exports: { './*': './p1/*.js', './*.js': './p2/*.js' } }));
    for (const f of files) { mkdirSync(path.dirname(path.join(pkg, f)), { recursive: true }); writeFileSync(path.join(pkg, f), ''); }
    const from = path.join(dir, 'from.mjs');
    writeFileSync(from, 'try { console.log(new URL(import.meta.resolve(process.argv[2])).pathname); } catch (e) { console.log(`ERR ${e.code}`); }\n');
    const node = (spec) => execFileSync(process.execPath, [from, spec], { encoding: 'utf8' }).trim();
    return { pkg, from, node };
  };
  test("positivo ./* frente a ./*.js: 'pk/q.js' inspecciona p2/q.js (gana ./*.js, como Node), no p1/q.js.js", () => {
    const { pkg, from, node } = exact('x-pos', ['p1/q.js.js', 'p2/q.js', 'p1/q.js']);
    assert.equal(resolveEsm('pk/q.js', from), path.join(pkg, 'p2', 'q.js'));
    assert.equal(node('pk/q.js'), path.join(pkg, 'p2', 'q.js'));
    assert.equal(resolveEsm('pk/q', from), path.join(pkg, 'p1', 'q.js'));
    assert.equal(node('pk/q'), path.join(pkg, 'p1', 'q.js'));
  });
  test("negativo ./* frente a ./*.js: si falta p2/q.js, Node sigue eligiendo p2/q.js y resolveEsm no se cae a ./* (p1/q.js.js existe): no resuelve -> falla cerrado", () => {
    const { pkg, from, node } = exact('x-neg', ['p1/q.js.js']);
    assert.equal(node('pk/q.js'), path.join(pkg, 'p2', 'q.js'));
    assert.equal(resolveEsm('pk/q.js', from), null);
  });
});
