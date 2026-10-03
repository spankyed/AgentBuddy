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
import * as realSpecCost from '../../../scripts/lib/spec-cost.ts';
import * as realMeasure from '../../../scripts/lib/measure.ts';
import { UNIT_SUITES } from '../../../scripts/lib/unit-suites.ts';

/**
 * The modules a mutation may break, by the name an entry gives in `in`.
 *
 * One module when this was written, and two since the sample-recording primitives moved to `measure.ts` to
 * be shared with the chain's own cost table. An entry naming no module breaks `spec-cost.ts`, which is what
 * every entry but one does.
 */
const MODULES = {
  'spec-cost': { file: 'spec-cost.ts', real: realSpecCost as unknown as Lib },
  measure: { file: 'measure.ts', real: realMeasure as unknown as Lib },
} as const;
type Module = keyof typeof MODULES;

/** The intersection, because an entry calls only its own module's exports and the harness is generic over both */
type Lib = typeof realSpecCost & typeof realMeasure;

const DIRS = UNIT_SUITES.map((suite) => suite.dir);

/**
 * Two suites in the fixture, named so the list order is not alphabetical.
 *
 * Which is what makes sorting observable, and why these are invented rather than taken from `UNIT_SUITES`: a
 * real pair had to be searched for, the first two being in order already, and each call then walked real
 * package trees twice — 26ms where the fixture measures 0.
 */
const UNSORTED = ['zeta', 'alpha'];

const FAST = 'tests/a.spec.ts';
const before = (costs: Record<string, number>, skipped: string[] = []) =>
  ({ measuredAt: 'then', costs, skipped });

/**
 * Whether a run that moved no cost still dated the record.
 *
 * Projected to two words rather than compared directly: `measuredAt` is a fresh timestamp, so two runs differ
 * from each other whatever the mutation did, and an entry comparing it raw would pass for every break.
 */
const dated = (lib: Lib, input: {
  readonly previous: ReturnType<typeof before>;
  readonly skipped: readonly string[];
  readonly measuredFiles: readonly string[];
}): string => {
  const { record } = lib.settle({
    previous: input.previous,
    costs: { [FAST]: input.previous.costs[FAST]! },
    skipped: input.skipped,
    measuredFiles: input.measuredFiles,
    prune: [],
    rewriteAll: false,
  });
  return record.measuredAt === input.previous.measuredAt ? 'kept the old date' : 'dated the run';
};

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
  /** Which module holds the line, when it is not `spec-cost.ts` */
  readonly in?: Module;
  readonly from: string;
  readonly to: string;
  readonly call: (lib: Lib, tree: Tree) => unknown;
}

const MUTATIONS: readonly Mutation[] = [
  {
    why: 'absentNamed sorts the paths it returns',
    from: '}).sort();',
    to: '});',
    call: (lib, tree) => lib.absentNamed(tree.root, UNSORTED, UNSORTED.map((dir) => `packages/${dir}/tests/nope.spec.ts`)),
  },
  {
    why: 'absentNamed collects from every suite the paths reach into',
    from: 'suitesFor(suiteDirs, undefined, named).flatMap(',
    to: 'suitesFor(suiteDirs, undefined, named).slice(0, 1).flatMap(',
    call: (lib, tree) => lib.absentNamed(tree.root, UNSORTED, UNSORTED.map((dir) => `packages/${dir}/tests/nope.spec.ts`)),
  },
  {
    why: 'absentNamed names only the paths that are absent',
    from: 'absentIn(files, namedIn(dir, named))',
    to: 'namedIn(dir, named)',
    call: (lib, tree) => lib.absentNamed(tree.root, UNSORTED,
      [`packages/${UNSORTED[0]!}/${FAST}`, `packages/${UNSORTED[0]!}/tests/nope.spec.ts`]),
  },
  {
    why: 'settle reads what this run measured, not what the record already held',
    from: 'input.skipped.filter((file) => costs[file] === undefined)',
    to: 'input.skipped.filter((file) => settled[file] === undefined)',
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
    // With nothing recorded as skipped, the `every` beside this is vacuously true, so the count is the only
    // clause that can see a skip arrive
    why: 'settle dates a run where a spec newly stopped running',
    from: 'previous.skipped.length === skipped.length',
    to: 'true',
    call: (lib) => dated(lib, {
      previous: before({ [FAST]: 100 }),
      skipped: ['tests/needs-a-binary.spec.ts'],
      measuredFiles: [FAST, 'tests/needs-a-binary.spec.ts'],
    }),
  },
  {
    // One skip replacing another: the counts match, so only the contents can tell these records apart. The
    // outgoing skip has to be in `measuredFiles`, which is what lets `keptSkipped` drop it
    why: 'settle dates a run where one skip replaced another',
    from: 'previous.skipped.every((file, index) => skipped[index] === file)',
    to: 'true',
    call: (lib) => dated(lib, {
      previous: before({ [FAST]: 100 }, ['tests/was-skipped.spec.ts']),
      skipped: ['tests/now-skipped.spec.ts'],
      measuredFiles: [FAST, 'tests/was-skipped.spec.ts', 'tests/now-skipped.spec.ts'],
    }),
  },
  {
    why: 'settle names the specs that lost a cost',
    from: 'dropped: Object.keys(previous?.costs ?? {})',
    to: 'dropped: ([] as string[])',
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
    from: 'sorted[spec] === undefined && !prune.includes(spec)',
    to: 'sorted[spec] === undefined',
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
    from: 'rewriteAll || moved(',
    to: 'moved(',
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
    from: 'if (strange.length > 0) {',
    to: 'if (false) {',
    call: (lib) => lib.parseArgs(['--update', '--drry'], DIRS),
  },
  {
    why: 'suitesFor narrows to the suite a named path belongs to',
    from: 'named.some((file) => file.startsWith(',
    to: 'false && named.some((file) => file.startsWith(',
    call: (lib) => lib.suitesFor(DIRS, undefined, [`packages/${DIRS[0]!}/tests/a.spec.ts`]),
  },
  {
    why: 'refusesAsContended lets --force through',
    in: 'measure',
    from: '!input.force && contended(',
    to: 'contended(',
    call: (lib) => lib.refusesAsContended({ hasPrevious: true, force: true, moved: 6, comparable: 20 }),
  },
  {
    why: 'refuseAbsent throws for a spec that is not there',
    from: 'if (absent.length === 0) return;',
    to: 'if (true) return;',
    call: (lib) => lib.refuseAbsent('mini', [FAST], ['tests/nope.spec.ts']),
  },
  {
    why: 'planFor asks for the half an unmeasured spec lives in',
    from: 'reason: `${needs.length} unmeasured`',
    to: 'reason: \'current\'',
    call: (lib, tree) => lib.planFor(tree.root, 'mini', [], false),
  },
  // The break this table was missing. `misplaced` and `outgrown` answer for two package shapes, and the
  // precondition choosing between them used to sit at each call site: of four callers, the one that forgot
  // told a one-half package its specs were "in the wrong half" and named a half that package has not got.
  // `mini` writes only `vitest.config.ts`, so it is that shape, and forcing the split branch has to change
  // the kind it comes back with.
  {
    why: 'overBudget asks the package whether it has a half to move a spec into',
    from: '(hasSplit(packageDir) ? misplaced : outgrown)(costs, files)',
    to: '(misplaced)(costs, files)',
    call: (lib, tree) => lib.overBudget(path.join(tree.root, 'packages', 'mini'), { [FAST]: 9_999 }, [FAST]),
  },
  /**
   * Not a decision inside a function but a constant, and the one the two edges have to agree on. 1 500 is
   * what it was until 2026-10-01, when the band turned out to be narrower than the change a move makes to
   * a reading, and `spec-plan.spec.ts` was told to move in both directions at once.
   *
   * The projection is the first cost that loops: the smallest integration reading that comes back to the
   * fast half and then reads above the upper edge once it is there. At the real value no such cost
   * exists, so this is `undefined`; at 1 500 it is a number.
   */
  {
    why: 'the band is wider than the change a move makes to a reading',
    from: 'export const FAST_BELOW_MS = 1_000;',
    to: 'export const FAST_BELOW_MS = 1_500;',
    call: (lib) => {
      for (let ms = 1; ms <= 40_000; ms += 1) {
        const cameBack = lib.halfFor('tests/x.integration.spec.ts', ms) === 'fast';
        if (cameBack && lib.halfFor('tests/x.spec.ts', ms * lib.CONTENTION_RATIO_MAX) !== 'fast') return ms;
      }
      return undefined;
    },
  },

  // The wording is a decision too, and it is the one the defect actually was: a string telling a reader to
  // rename a file into a half that does not exist.
  {
    why: 'describeBudget tells the two kinds apart',
    from: "over.length > 0 ? 'Make it cheaper, or record it in EXPENSIVE_BY_NATURE with what makes it expensive.' : '',",
    to: "over.length > 0 ? '' : '',",
    call: (lib) => lib.describeBudget([{ kind: 'over', file: FAST, ms: 9_999 }], 'a-suite-with-no-entries'),
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
  const sources = new Map<Module, string>();

  beforeAll(() => {
    for (const [name, { file }] of Object.entries(MODULES)) {
      sources.set(name as Module, fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'lib', file), 'utf-8'));
    }
    (tree as { root: string }).root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-cost-mutations-'));
    const write = (rel: string, body: string): void => {
      fs.mkdirSync(path.dirname(path.join(tree.root, rel)), { recursive: true });
      fs.writeFileSync(path.join(tree.root, rel), body);
    };
    write('packages/mini/vitest.config.ts', 'export default {};\n');
    write('packages/mini/tests/a.spec.ts', '');
    write('packages/mini/tests/b.spec.ts', '');
    // Named so that `UNSORTED` is not in alphabetical order, which is what makes the sort observable
    for (const dir of UNSORTED) write(`packages/${dir}/${FAST}`, '');
    // `a` recorded and `b` not, which is what makes the unmeasured branch reachable. No live suite is in this
    // state — a green tree means every spec is recorded, so the branch a bare update takes needs a tree of its own
    write(realSpecCost.specCostFile('mini'), `${JSON.stringify({ measuredAt: 'then', costs: { [FAST]: 100 }, skipped: [] }, null, 2)}\n`);
  });

  afterAll(() => fs.rmSync(tree.root, { recursive: true, force: true }));

  it('has mutations to run, since an empty table would report nothing', () => {
    expect(MUTATIONS.length).toBeGreaterThan(10);
    expect([...UNSORTED].sort(), 'the fixture suites must not be in order, or the sort is unobservable')
      .not.toEqual(UNSORTED);
  });

  // Anchors are text, so a refactor turns an entry into a no-op that still passes. Checked first and named,
  // the same way `EXPENSIVE_BY_NATURE` is held to naming something that is still expensive
  /**
   * The mutant is written to a temp directory, so a relative import in the source would not resolve from
   * there. Rewriting them is what lets the module under test have imports at all — it had none, and that
   * looked like a property of the module when it was a property of this spec.
   */
  const absolute = (body: string): string =>
    body.replace(/from '\.\/([\w.-]+)'/g, (_, file: string) => `from '${pathToFileURL(path.join(REPO_ROOT, 'scripts', 'lib', file)).href}'`);

  it.each(MUTATIONS)('finds the line for: $why', ({ from, in: where = 'spec-cost' }) => {
    const source = sources.get(where)!;
    expect(source.split(from).length - 1,
      `this mutation no longer applies; update its \`from\` (or its \`in\`):\n${from}`).toBe(1);
  });

  it.each(MUTATIONS)('$why', async ({ from, to, call, in: where = 'spec-cost' }) => {
    const file = path.join(tree.root, `mutant-${MUTATIONS.findIndex((entry) => entry.from === from)}.ts`);
    fs.writeFileSync(file, absolute(sources.get(where)!.replace(from, to)));
    const mutant = await import(pathToFileURL(file).href) as Lib;

    expect(outcome(() => call(mutant, tree)),
      'breaking this changed nothing the case looks at, so the case is watching something else')
      .not.toEqual(outcome(() => call(MODULES[where].real, tree)));
  });
});
