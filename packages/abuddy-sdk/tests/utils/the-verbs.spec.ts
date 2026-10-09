// **Two operations, and what a function hands back is what says which it performs.** `apply` converges the
// database toward what a pack declares and never overwrites the user; `import` puts a pack's content back
// because the user asked, reads none of what an apply recorded, and overwriting is the request. A name can
// be anything, so the signature is what this reads: `ApplyResult` out means the name says `apply`,
// `ImportResult` means it says `import`.
//
// It guards the property rather than any particular name — a new `writeStuff(): ApplyResult` fails here
// whichever word someone reached for — and it is the one check that can see what a rule over names cannot:
// `applyPacks` hands back the packs that failed rather than either result, so a rule reading only names
// would have been blind to it in both directions.
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

/** Each root's sources, read once: both rules below are over the same text */
const SOURCES = ROOTS.flatMap((root) =>
  tsFiles(path.join(PACKAGES, root))
    .map((file) => ({ file: path.relative(PACKAGES, file), text: fs.readFileSync(file, 'utf-8') })),
);

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
function verbsIn(source: string): Array<{ name: string; verb: Verb }> {
  const found: Array<{ name: string; verb: Verb }> = [];
  for (const [type, verb] of Object.entries(VERBS)) {
    for (const m of source.matchAll(new RegExp(String.raw`\)\s*:\s*([^{;=\n]*\b${type}\b[^{;=\n]*)`, 'g'))) {
      const name = nameBefore(source, m.index);
      if (name) found.push({ name, verb });
    }
  }
  return found;
}

/** Every exported function, const or type in `source`, by name */
function exportsIn(source: string): string[] {
  return [...source.matchAll(/^export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm)]
    .map((m) => m[1]!);
}

describe('a function says which operation it performs', () => {
  const found = SOURCES.flatMap(({ file, text }) => verbsIn(text).map((hit) => ({ ...hit, file })));

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

  /**
   * **And not after the noun that left**, which the rule below does not reach: that one reads exported
   * names, and this reads signatures, so a local function or an object-literal method is caught only here.
   */
  it('names none of them after the noun that left', () => {
    const offenders = found.filter((f) => /seed/i.test(f.name));
    expect(offenders.map((o) => `${o.file}: ${o.name}`)).toEqual([]);
  });
});

/**
 * **The noun these operations replaced is in no export's name.** A scan over one word is a rule that can
 * exist, where "is this a verb" is a judgement a scan makes wrongly: `seed` either appears or it does not.
 *
 * **It has no exception list, and must not grow one.** The word survives in this repo in four places and an
 * export of these three packages is none of them: this spec and the goal that records the rename, which
 * have to name it to be about it; the stored `AppState` keys the 0.3.15 migration moves away from, which
 * name data on disk; four identifiers that contain the four letters across a word boundary
 * (`baseEditorOptions`, `elseEdge`); and the emoji picker's search keywords, since 🌱 is found by typing it.
 */
describe('the noun that left', () => {
  const exported = SOURCES.flatMap(({ file, text }) => exportsIn(text).map((name) => ({ name, file })));

  it('reads a population, so the rule below is checking something', () => {
    expect(exported.length, 'no exports were found — the scan is broken').toBeGreaterThan(200);
  });

  it('is in no export’s name', () => {
    const offenders = exported.filter((e) => /seed/i.test(e.name));
    expect(offenders.map((o) => `${o.file}: ${o.name}`)).toEqual([]);
  });
});
