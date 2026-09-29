// Whether the cases covering `scripts/lib/spec-cost.ts` can see the decisions they are about.
//
// Root CLAUDE.md already says a mutation check is worth more than a re-run, and two cases shipped under that
// rule that could not see what they claimed to cover: one watching `settle`'s `skipped` comparison also moved
// a cost, so removing the comparison left every case green; one watching `absentNamed`'s sort derived its two
// suites as the first two `UNIT_SUITES` entries, which are already in alphabetical order, so sorted and
// unsorted output were the same list. Both were found by breaking the source on purpose, and that evidence
// then existed only in a commit message.
//
// So it lives here instead. Each entry breaks one line of the module and calls the same function on the same
// input as the real one: **the two answers must differ.** An entry that stops differing is a decision nothing
// can observe any more, which is the state both of those cases were in.
//
// Be exact about what that buys, because the neighbouring claim is the tempting one and it is false: this
// pins a discriminating input per decision, so a decision cannot be deleted in silence. It does **not** police
// whether the cases in `suite-split.spec.ts` use a discriminating input — their inputs are their own, and what
// keeps that one honest is its own assertion that the answer differs from the order it passed in. Sharing the
// fixtures between the two files would close that, and is the next step if this is ever worth extending.
//
// It covers the breaks the table lists and no others: it makes today's evidence permanent rather than going
// looking for tomorrow's. `docs/archive/plans/vacuous-assertions.md` records why a firing case per check is a
// larger programme than this.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import * as real from '../../../scripts/lib/spec-cost.ts';
import { UNIT_SUITES } from '../../../scripts/lib/unit-suites.ts';

type Lib = typeof real;
const SOURCE = path.join(REPO_ROOT, 'scripts', 'lib', 'spec-cost.ts');

const DIRS = UNIT_SUITES.map((suite) => suite.dir);

/** Two adjacent suites the list holds out of alphabetical order, so that sorting is observable at all */
const OUT_OF_ORDER = ((): string[] => {
  const at = DIRS.findIndex((dir, index) => index + 1 < DIRS.length && dir > DIRS[index + 1]!);
  return at === -1 ? [] : [DIRS[at]!, DIRS[at + 1]!];
})();

const FAST = 'tests/a.spec.ts';
const before = (costs: Record<string, number>, skipped: string[] = []) =>
  ({ measuredAt: 'then', costs, skipped });

/** A pack tree whose record disagrees with the specs beside it, which no live suite does */
interface Tree { readonly root: string }

/**
 * One break, and the call that has to notice it.
 *
 * `call` projects to something stable rather than returning the record whole: a fresh `measuredAt` differs
 * between any two runs, so comparing it directly would pass for every mutation and prove nothing.
 */
interface Mutation {
  readonly why: string;
  readonly from: string;
  readonly to: string;
  readonly call: (lib: Lib, tree: Tree) => unknown;
}

const MUTATIONS: readonly Mutation[] = [
  {
    why: 'absentNamed sorts the paths it returns',
    from: '  }).sort();',
    to: '  });',
    call: (lib) => lib.absentNamed(REPO_ROOT, DIRS, OUT_OF_ORDER.map((dir) => `packages/${dir}/tests/nope.spec.ts`)),
  },
  {
    why: 'absentNamed collects from every suite the paths reach into',
    from: '  return suitesFor(suiteDirs, undefined, named).flatMap((dir) => {',
    to: '  return suitesFor(suiteDirs, undefined, named).slice(0, 1).flatMap((dir) => {',
    call: (lib) => lib.absentNamed(REPO_ROOT, DIRS, OUT_OF_ORDER.map((dir) => `packages/${dir}/tests/nope.spec.ts`)),
  },
  {
    why: 'absentNamed names only the paths that are absent',
    from: '    return absentIn(files, namedIn(dir, named)).map((file) => `packages/${dir}/${file}`);',
    to: '    return namedIn(dir, named).map((file) => `packages/${dir}/${file}`);',
    call: (lib) => {
      const dir = DIRS[0]!;
      const here = lib.specFiles(path.join(REPO_ROOT, 'packages', dir))[0]!;
      return lib.absentNamed(REPO_ROOT, DIRS, [`packages/${dir}/${here}`, `packages/${dir}/tests/nope.spec.ts`]);
    },
  },
  {
    why: 'settle reads what this run measured, not what the record already held',
    from: '  const nowSkipped = input.skipped.filter((file) => costs[file] === undefined);',
    to: '  const nowSkipped = input.skipped.filter((file) => settled[file] === undefined);',
    call: (lib) => lib.settle({
      previous: before({ [FAST]: 1_200, 'tests/b.spec.ts': 800 }),
      costs: { 'tests/b.spec.ts': 810 },
      skipped: [FAST],
      measuredFiles: [FAST, 'tests/b.spec.ts'],
      prune: [],
      rewriteAll: false,
    }).record.skipped,
  },
  {
    why: 'settle dates a run where only the skipped list moved',
    from: `    && previous.skipped.length === skipped.length
    && previous.skipped.every((file, index) => skipped[index] === file);`,
    to: ';',
    call: (lib) => {
      const previous = before({ [FAST]: 100 });
      const { record } = lib.settle({
        previous,
        costs: { [FAST]: 100 },
        skipped: ['tests/needs-a-binary.spec.ts'],
        measuredFiles: [FAST, 'tests/needs-a-binary.spec.ts'],
        prune: [],
        rewriteAll: false,
      });
      return record.measuredAt === previous.measuredAt ? 'kept the old date' : 'dated the run';
    },
  },
  {
    why: 'settle names the specs that lost a cost',
    from: '    dropped: Object.keys(previous?.costs ?? {}).filter((spec) => sorted[spec] === undefined && !prune.includes(spec)),',
    to: '    dropped: [],',
    call: (lib) => lib.settle({
      previous: before({ [FAST]: 1_200, 'tests/b.spec.ts': 800 }),
      costs: { 'tests/b.spec.ts': 810 },
      skipped: [FAST],
      measuredFiles: [FAST, 'tests/b.spec.ts'],
      prune: [],
      rewriteAll: false,
    }).dropped,
  },
  {
    why: 'settle leaves a pruned spec to the caller that pruned it',
    from: 'sorted[spec] === undefined && !prune.includes(spec)),',
    to: 'sorted[spec] === undefined),',
    call: (lib) => lib.settle({
      previous: before({ [FAST]: 100, 'tests/gone.spec.ts': 200 }),
      costs: { [FAST]: 100 },
      skipped: [],
      measuredFiles: [FAST],
      prune: ['tests/gone.spec.ts'],
      rewriteAll: false,
    }).dropped,
  },
  {
    why: 'settle records what --all measured, past the tolerance',
    from: '    settled[spec] = rewriteAll || moved(spec, before, ms) ? ms : before!;',
    to: '    settled[spec] = moved(spec, before, ms) ? ms : before!;',
    call: (lib) => lib.settle({
      previous: before({ [FAST]: 1_000 }),
      costs: { [FAST]: 1_050 },
      skipped: [],
      measuredFiles: [FAST],
      prune: [],
      rewriteAll: true,
    }).record.costs[FAST],
  },
  {
    why: 'parseArgs refuses a flag it does not know',
    from: '  if (strange.length > 0) {',
    to: '  if (false) {',
    call: (lib) => lib.parseArgs(['--update', '--drry'], DIRS),
  },
  {
    why: 'suitesFor narrows to the suite a named path belongs to',
    from: '    .filter((dir) => named.length === 0 || named.some((file) => file.startsWith(`packages/${dir}/`)));',
    to: '    .filter(() => true);',
    call: (lib) => lib.suitesFor(DIRS, undefined, [`packages/${DIRS[0]!}/tests/a.spec.ts`]),
  },
  {
    why: 'refusesAsContended lets --force through',
    from: '}): boolean => input.hasPrevious && !input.force && contended(input.moved, input.comparable);',
    to: '}): boolean => input.hasPrevious && contended(input.moved, input.comparable);',
    call: (lib) => lib.refusesAsContended({ hasPrevious: true, force: true, moved: 6, comparable: 20 }),
  },
  {
    why: 'refuseAbsent throws for a spec that is not there',
    from: '  if (absent.length === 0) return;',
    to: '  if (true) return;',
    call: (lib) => lib.refuseAbsent('mini', [FAST], ['tests/nope.spec.ts']),
  },
  {
    why: 'planFor asks for the half an unmeasured spec lives in',
    from: '  if (needs.length > 0) return { configs: configsOf(packageDir, needs), prune, reason: `${needs.length} unmeasured` };',
    to: '',
    call: (lib, tree) => lib.planFor(tree.root, 'mini', [], false),
  },
];

/** A value or the message it threw, so a break that turns a refusal into a return still compares */
const outcome = (run: () => unknown): unknown => {
  try {
    return { ok: run() };
  } catch (error) {
    return { threw: (error as Error).message.slice(0, 120) };
  }
};

describe('every decision in spec-cost.ts is one its cases can see', () => {
  const tree: Tree = { root: '' };
  let source = '';

  beforeAll(() => {
    source = fs.readFileSync(SOURCE, 'utf-8');
    (tree as { root: string }).root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-cost-mutations-'));
    const write = (rel: string, body: string): void => {
      fs.mkdirSync(path.dirname(path.join(tree.root, rel)), { recursive: true });
      fs.writeFileSync(path.join(tree.root, rel), body);
    };
    write('packages/mini/vitest.config.ts', 'export default {};\n');
    write('packages/mini/tests/a.spec.ts', '');
    write('packages/mini/tests/b.spec.ts', '');
    // `a` recorded and `b` not, which is what makes the unmeasured branch reachable. No live suite is in this
    // state — a green tree means every spec is recorded, so the branch a bare update takes needs a tree of its own
    write(real.specCostFile('mini'), `${JSON.stringify({ measuredAt: 'then', costs: { [FAST]: 100 }, skipped: [] }, null, 2)}\n`);
  });

  afterAll(() => fs.rmSync(tree.root, { recursive: true, force: true }));

  it('has mutations to run, since an empty table would report nothing', () => {
    expect(MUTATIONS.length).toBeGreaterThan(10);
    expect(OUT_OF_ORDER, 'no two adjacent suites are out of alphabetical order, so the sort is unobservable')
      .toHaveLength(2);
  });

  // Anchors are text, so a refactor turns an entry into a no-op that still passes. Checked first and named,
  // the same way `EXPENSIVE_BY_NATURE` is held to naming something that is still expensive
  it.each(MUTATIONS)('finds the line for: $why', ({ from }) => {
    expect(source.split(from).length - 1, `this mutation no longer applies; update its \`from\`:\n${from}`).toBe(1);
  });

  it.each(MUTATIONS)('$why', async ({ from, to, call }) => {
    const file = path.join(tree.root, `mutant-${MUTATIONS.findIndex((entry) => entry.from === from)}.ts`);
    fs.writeFileSync(file, source.replace(from, to));
    const mutant = await import(pathToFileURL(file).href) as Lib;

    expect(outcome(() => call(mutant, tree)),
      'breaking this changed nothing the case looks at, so the case is watching something else')
      .not.toEqual(outcome(() => call(real, tree)));
  });
});
