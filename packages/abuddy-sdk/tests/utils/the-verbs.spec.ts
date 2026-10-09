// **Two operations, and what a function hands back is what says which it performs.** `apply` converges the
// database toward what a pack declares and never overwrites the user; `import` puts a pack's content back
// because the user asked, reads none of what an apply recorded, and overwriting is the request. A name can
// be anything, so the signature is what this reads: `ApplyResult` out means the name says `apply`,
// `ImportResult` means it says `import`.
//
// It guards the property rather than any particular name — a new `writeStuff(): ApplyResult` fails here
// whichever word someone reached for — and it is the one check that can see the hole the old rule could
// not: that rule only refused the leaving noun (`seed*`), so `seedPacks`, which returns failures, was
// invisible to it in both directions.
//
// **Not extended to "no identifier contains both a noun and a verb stem"**, which the same audit proposed:
// a scan cannot tell a verb stem from a noun, so it reports false findings for no gain this rule does not
// already give.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PACKAGES = path.resolve(import.meta.dirname, '../../..');
/** Every package whose code may apply or import content; `@abuddy/ears` sits below the SDK and has none */
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

/** The two result types, and the verb a function handing one back has to say */
const VERBS = { ApplyResult: 'apply', ImportResult: 'import' } as const;
type Verb = (typeof VERBS)[keyof typeof VERBS];

/** Every function or method in `source` whose return type mentions one of them, by name and by verb */
export function verbsIn(source: string): Array<{ name: string; verb: Verb }> {
  const found: Array<{ name: string; verb: Verb }> = [];
  for (const [type, verb] of Object.entries(VERBS)) {
    for (const m of source.matchAll(new RegExp(String.raw`\)\s*:\s*([^{;=\n]*\b${type}\b[^{;=\n]*)`, 'g'))) {
      const name = nameBefore(source, m.index);
      if (name) found.push({ name, verb });
    }
  }
  return found;
}

describe('a function says which operation it performs', () => {
  const found = ROOTS.flatMap((root) =>
    tsFiles(path.join(PACKAGES, root)).flatMap((file) =>
      verbsIn(fs.readFileSync(file, 'utf-8')).map((hit) => ({ ...hit, file: path.relative(PACKAGES, file) })),
    ),
  );

  it('finds both kinds, so neither rule below is checking nothing', () => {
    for (const verb of ['apply', 'import'] as const) {
      expect(found.filter((f) => f.verb === verb).length, `no function returning the ${verb} result was found — the scan is broken, not the code`)
        .toBeGreaterThan(0);
    }
  });

  it('names an apply `apply` and an import `import`', () => {
    const offenders = found.filter((f) => !f.name.toLowerCase().includes(f.verb));
    expect(offenders.map((o) => `${o.file}: ${o.name} returns the ${o.verb} result`)).toEqual([]);
  });

  /** And the noun that left the vocabulary is not in either of their names */
  it('names none of them after the content', () => {
    const offenders = found.filter((f) => /seed/i.test(f.name));
    expect(offenders.map((o) => `${o.file}: ${o.name}`)).toEqual([]);
  });
});

/**
 * **The half a return type cannot reach.** `applyPacks` hands back the packs that failed, so the rule above
 * is blind to it in both directions — and that is exactly the function the noun used to be in. So the
 * second rule is over names: no export carries `seed`.
 *
 * It is a scan over one word rather than over verb stems, which is why it can exist: `seed` either appears
 * or it does not, where "is this a verb" is a judgement a scan makes wrongly.
 */
const KEEPS_THE_NOUN: Record<string, string> = {
  seedPath: 'the compiled file `<key>.seed.json`, which a built pack holds on disk',
  seedFile: 'the same file name, built from a key',
  SEED_INDEX_FILE: '`seeds.json`, read by every built pack on disk',
  SEED_COMPILERS_FILE: '`seed-compilers.mjs`, read from a dependency’s built dir',
  SeedIndex: 'the shape of `seeds.json`, which keeps its name because the file does',
  SeedIndexEntry: 'one of its rows',
};

/**
 * The same keeps for the two packages a scan over `ROOTS` does not cover — `@abuddy/cli`, which writes the
 * built files, is not one of them, so this records that it is where the rest of the noun lives:
 * `SEED_RUNTIME_FILE`, `bundlePackSeedRuntime`, `bundlePackSeedCompilers`, `checkSeedRuntimeLoads`, each
 * named after a file on disk.
 */

/** Every exported function, const or type in `source`, by name */
function exportsIn(source: string): string[] {
  return [...source.matchAll(/^export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm)]
    .map((m) => m[1]!);
}

describe('the noun that left', () => {
  const exported = ROOTS.flatMap((root) =>
    tsFiles(path.join(PACKAGES, root)).flatMap((file) =>
      exportsIn(fs.readFileSync(file, 'utf-8')).map((name) => ({ name, file: path.relative(PACKAGES, file) })),
    ),
  );

  it('reads a population, so the rule below is checking something', () => {
    expect(exported.length, 'no exports were found — the scan is broken').toBeGreaterThan(200);
  });

  it('is in no export’s name but the files on disk still called that', () => {
    const offenders = exported.filter((e) => /seed/i.test(e.name) && !(e.name in KEEPS_THE_NOUN));
    expect(offenders.map((o) => `${o.file}: ${o.name}`)).toEqual([]);
  });

  /** A keep that names nothing is a reason nobody can check, which is what an exception list rots into */
  it('keeps nothing that is no longer there', () => {
    const names = new Set(exported.map((e) => e.name));
    expect(Object.keys(KEEPS_THE_NOUN).filter((name) => !names.has(name))).toEqual([]);
  });
});
