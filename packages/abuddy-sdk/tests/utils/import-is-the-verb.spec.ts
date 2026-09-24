// `seed` is a noun in this repo — the authored content, its identity, its shape and its configuration. The act of
// applying it is `import`. The two used to share the word, across four pipeline stages, and the sentence a reader
// most needed could not be written: "the only keys an import of its seeds can seed".
//
// A convention nobody can check is not one, so this pins the half that goes wrong: anything that performs an import
// says so in its name. A function's return type is what identifies it — a name can be anything, but a signature
// that hands back `ImportCounts` is doing the importing — so that is what this reads.
//
// It guards the property, not any particular old name: a new `seedFoo(): ImportCounts` fails here just as the
// original `seedData` would, which is the point.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PACKAGES = path.resolve(import.meta.dirname, '../../..');
/** Every package whose code may import seeds; `@abuddy/ears` sits below the SDK and has no such concept */
const ROOTS = ['abuddy-sdk/src', 'abuddy-host/src', 'abuddy-testing/src'];

function tsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return tsFiles(full);
    return e.isFile() && e.name.endsWith('.ts') ? [full] : [];
  });
}

/** The identifier a signature belongs to: walk back over its parameter list to the name before it */
function nameBefore(source: string, openParen: number): string | null {
  let depth = 0;
  let i = openParen;
  for (; i >= 0; i--) {
    const c = source[i];
    if (c === ')') depth++;
    else if (c === '(' && --depth === 0) break;
  }
  const head = source.slice(Math.max(0, i - 120), i);
  // `function foo`, `const foo = `, a method `foo`, or `foo: ` on an object literal
  return /([A-Za-z_$][\w$]*)\s*(?:<[^<>]*>)?\s*$/.exec(head)?.[1] ?? null;
}

/** Every function or method in `source` whose return type mentions `ImportCounts`, by name */
export function importersIn(source: string): string[] {
  const names: string[] = [];
  for (const m of source.matchAll(/\)\s*:\s*([^{;=\n]*ImportCounts[^{;=\n]*)/g)) {
    const name = nameBefore(source, m.index);
    if (name) names.push(name);
  }
  return names;
}

describe('import is the verb', () => {
  const found = ROOTS.flatMap((root) =>
    tsFiles(path.join(PACKAGES, root)).flatMap((file) =>
      importersIn(fs.readFileSync(file, 'utf-8')).map((name) => ({ name, file: path.relative(PACKAGES, file) })),
    ),
  );

  it('finds the functions that import, so the rule below is checking something', () => {
    expect(found.length, 'no function returning ImportCounts was found — the scan is broken, not the code').toBeGreaterThan(2);
  });

  it('names none of them `seed*`', () => {
    const offenders = found.filter((f) => /^seed/i.test(f.name));
    expect(offenders.map((o) => `${o.file}: ${o.name}`)).toEqual([]);
  });
});
