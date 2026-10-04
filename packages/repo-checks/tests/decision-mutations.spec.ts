// Whether a decision in `scripts/lib/` can be observed at all — by the cases that cover it, or by anything.
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
// looking for tomorrow's.
//
// **Five modules, and what qualifies one is reachability rather than subject.** It began as one, grew to two
// when the sample-recording primitives moved to `measure.ts`, and took `step-timeouts.ts`,
// `chain-schedule.ts` and `core-budget.ts` when the hand-run version of this ritual was retired: copy the
// file, edit it, run a
// filtered command, read the output, restore. That has three independent ways to lie — a restore that takes
// the index rather than your work, a run that does not run, and a filter that hides the answer — and two of
// the three were observed in one session. Here there is nothing to restore, the suite cannot skip it, and a
// non-discriminating entry *fails*, which the ritual could never do. `docs/archive/plans/vacuous-assertions.md` records why a firing case per check is a
// larger programme than this.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import * as realSpecCost from '../../../scripts/lib/spec-cost.ts';
import * as realMeasure from '../../../scripts/lib/measure.ts';
import * as realStepTimeouts from '../../../scripts/lib/step-timeouts.ts';
import * as realChainSchedule from '../../../scripts/lib/chain-schedule.ts';
import * as realCoreBudget from '../../../scripts/lib/core-budget.ts';
import * as realStepTiming from '../../../scripts/lib/step-timing.ts';
import { UNIT_SUITES } from '../../../scripts/lib/unit-suites.ts';

/**
 * The modules a mutation may break, by the name an entry gives in `in`.
 *
 * **What a module needs to be here is that a mutant of it resolves from a temp directory**, since that is
 * where `absolute` writes one: no imports, or only node builtins, or only relative specifiers it can
 * rewrite. `chain-output.ts` is the near miss — a bare `@abuddy/host/build/packages-built` has no
 * `node_modules` on the walk-up from `os.tmpdir()`, so it stays out until someone has a reason to write
 * mutants inside the tree.
 *
 * An entry naming no module breaks `spec-cost.ts`, which is what most of them do.
 */
const MODULES = {
  'spec-cost': { file: 'spec-cost.ts', real: realSpecCost as unknown as Lib },
  measure: { file: 'measure.ts', real: realMeasure as unknown as Lib },
  'step-timeouts': { file: 'step-timeouts.ts', real: realStepTimeouts as unknown as Lib },
  'chain-schedule': { file: 'chain-schedule.ts', real: realChainSchedule as unknown as Lib },
  'core-budget': { file: 'core-budget.ts', real: realCoreBudget as unknown as Lib },
  // Reachable for the same reason the others are: its only imports are siblings in `scripts/lib`, which
  // `absolute()` below rewrites, and a type from `chain-schedule.ts`, which erases
  'step-timing': { file: 'step-timing.ts', real: realStepTiming as unknown as Lib },
} as const;
type Module = keyof typeof MODULES;

/** The intersection, because an entry calls only its own module's exports and the harness is generic over all */
type Lib = typeof realSpecCost & typeof realMeasure & typeof realStepTimeouts & typeof realChainSchedule
  & typeof realCoreBudget & typeof realStepTiming;

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
const before = (costs: Record<string, number>, skipped: string[] = [], unmeasured: string[] = []) =>
  realSpecCost.withCosts({
    measuredAt: 'then',
    // One reading per spec, which is the shape a record migrated off point estimates has
    samples: Object.fromEntries(Object.entries(costs).map(([spec, ms]) => [spec, [ms]])),
    skipped,
    unmeasured,
    machine: realCoreBudget.thisMachine(),
  });

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
    forgetWindows: false,
  });
  return record.measuredAt === input.previous.measuredAt ? 'kept the old date' : 'dated the run';
};

/** A pack tree whose record disagrees with the specs beside it, which no live suite does */
interface Tree { readonly root: string }

interface Step { readonly name: string; readonly dependsOn: string[]; readonly conflicts?: string[]; readonly cores?: number }
const sstep = (name: string, dependsOn: string[] = [], extra: Partial<Step> = {}): Step =>
  ({ name, dependsOn, ...extra });

/**
 * What a scheduled run did, as strings — the projection the scheduler's entries compare.
 *
 * **Never the raw `ScheduleResult`.** `threw[].error` holds `Error` objects, which `toEqual` compares by
 * message alone, and a `Map` or `Set` compares order-insensitively — both weaken exactly the discrimination
 * an entry is for. `peers` carries the most: it is written at dispatch, in both directions, so it says what
 * overlapped what, which is how a budget decision is visible at all.
 *
 * `run` resolves immediately and that is sufficient, so the `release`/`drain` machinery in
 * `chain-schedule.spec.ts` is deliberately not reproduced here: `schedule`'s dispatch pass is synchronous,
 * so `spent` is already full when the next candidate is judged, while the handlers that release it are
 * microtasks that cannot run until `await Promise.race`.
 */
const scheduled = async (lib: Lib, steps: readonly Step[], budget: number, options: {
  readonly failing?: readonly string[];
  readonly skipping?: readonly string[];
} = {}) => {
  const result = await lib.schedule({
    steps,
    budget,
    skip: (step) => (options.skipping ?? []).includes(step.name),
    run: async (step) => !(options.failing ?? []).includes(step.name),
  });
  return {
    started: result.started.join(','),
    skipped: result.skipped.join(','),
    failed: result.failed ?? 'none',
    peers: [...result.peers].map(([name, beside]) => `${name}:${[...beside].sort().join('+')}`).sort().join(' '),
  };
};

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
      forgetWindows: false,
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
    from: 'dropped: Object.keys(previous?.samples ?? {})',
    to: 'dropped: ([] as string[])',
    call: (lib) => lib.settle({
      previous: before({ [FAST]: 1_200, 'tests/b.spec.ts': 800 }),
      costs: { 'tests/b.spec.ts': 810 },
      skipped: [FAST],
      measuredFiles: [FAST, 'tests/b.spec.ts'],
      prune: [],
      forgetWindows: false,
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
      forgetWindows: false,
    }).dropped,
  },
  {
    why: 'settle forgets a window on --all --forget rather than appending to it',
    from: 'forgetWindows || before === undefined ? [ms]',
    to: 'before === undefined ? [ms]',
    call: (lib) => lib.settle({
      previous: before({ [FAST]: 1_000 }),
      costs: { [FAST]: 1_050 },
      skipped: [],
      measuredFiles: [FAST],
      prune: [],
      forgetWindows: true,
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
    from: '(hasSplit(packageDir) ? misplaced : outgrown)(samples, files)',
    to: '(misplaced)(samples, files)',
    call: (lib, tree) => lib.overBudget(path.join(tree.root, 'packages', 'mini'), { [FAST]: [9_999] }, [FAST]),
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
  /**
   * The scheduler's seven. Every one projects through `scheduled` above, and the inputs are chosen so the
   * decision is the only thing that moves — which is why each carries the two answers in its comment where
   * they are not obvious.
   */
  {
    why: 'the budget admits on what the live steps already hold',
    in: 'chain-schedule',
    from: 'if (spent > 0 && spent + (step.cores ?? 1) > budget) continue;',
    to: '',
    // Three four-core steps and ten to spend: `c` waits, so it overlaps nothing. Without the clause it
    // joins the other two and `peers` says so.
    call: (lib) => scheduled(lib, [sstep('a', [], { cores: 4 }), sstep('b', [], { cores: 4 }), sstep('c', [], { cores: 4 })], 10),
  },
  {
    why: 'the budget is soft, so a step wider than all of it still runs',
    in: 'chain-schedule',
    from: 'spent > 0 && ',
    to: '',
    // A hard comparison holds it for ever: nothing is running, so nothing will ever free the budget it
    // needs, and the loop exits having started it never. `started` is the whole answer.
    call: (lib) => scheduled(lib, [sstep('huge', [], { cores: 20 })], 10),
  },
  {
    why: 'a mutex holds in the direction the running step declares it, not only the candidate',
    in: 'chain-schedule',
    from: '          || (steps.find((candidate) => candidate.name === name)?.conflicts ?? []).includes(step.name);',
    to: ';',
    // `lock` names `b`; `b` names nothing. Only the second clause sees that, so without it the pair overlaps
    call: (lib) => scheduled(lib, [sstep('lock', [], { conflicts: ['b'] }), sstep('b')], 10),
  },
  {
    why: 'a step waits for what it depends on',
    in: 'chain-schedule',
    from: 'if (!step.dependsOn.every((need) => done.has(need))) continue;',
    to: '',
    // `b` sits first in the table and needs `a`, so the order is the answer: a,b against b,a
    call: (lib) => scheduled(lib, [sstep('b', ['a']), sstep('a')], 10),
  },
  {
    why: 'a skipped step counts as passed, so what needed it becomes ready',
    in: 'chain-schedule',
    from: `          skipped.push(step.name);
          done.add(step.name);`,
    to: '          skipped.push(step.name);',
    // Without the credit `b` is never ready, nothing is running, and the loop exits with it unstarted
    call: (lib) => scheduled(lib, [sstep('a'), sstep('b', ['a'])], 10, { skipping: ['a'] }),
  },
  {
    why: 'the first failure is the one reported, not the last',
    in: 'chain-schedule',
    from: 'else failed ??= step.name;',
    to: 'else failed = step.name;',
    // Two failing steps, both admitted in one pass. No case in `chain-schedule.spec.ts` has two.
    call: (lib) => scheduled(lib, [sstep('a'), sstep('b')], 10, { failing: ['a', 'b'] }),
  },
  {
    /**
     * The one entry that cannot simply call and compare: with the exit gone, `Promise.race` over an empty
     * map never settles, so the mutant hangs rather than answering. It is raced against a timer and
     * projected to a word. The losing promise is left pending on purpose — there is nothing to cancel, and
     * the alternative is no entry at all for the branch that stops the loop.
     */
    why: 'the loop stops when nothing is running and nothing was dispatched',
    in: 'chain-schedule',
    from: 'if (running.size === 0) break;',
    to: '',
    call: async (lib) => {
      const ran = scheduled(lib, [sstep('orphan', ['absent'])], 10).then(() => 'returned');
      return Promise.race([ran, new Promise((resolve) => setTimeout(() => resolve('hung'), 250))]);
    },
  },
  /**
   * `step-timeouts.ts` has no spec of its own. `chain-graph` reaches three of its exports directly — the
   * bound through `declaredShare`, each rung's provenance, and what a kill reports through `timedOutBecause`
   * — but nothing there pins a rung's *deadline*, so changing `quick` to six seconds still leaves every case
   * in the repo green. These four are what observes the rest.
   */
  {
    // The mutation is the *permissive* answer rather than a crash, because that is the decision: "a budget is
    // a ceiling, so the confident wrong answer is the permissive one". Dropping the guard would now throw a
    // TypeError on `rung.ms`, which differs from the named error and so would pass this — while testing that
    // reading a field of `undefined` fails, not that the function refuses
    why: 'timeoutMsFor refuses a class the ladder has not got, rather than defaulting to one',
    in: 'step-timeouts',
    from: '    throw new Error(`No such timeout class: ${className} — one of ${TIMEOUT_CLASSES.join(\', \')}`);',
    to: '    return TIMEOUT_MS.quick.ms;',
    call: (lib) => lib.timeoutMsFor('nonsense'),
  },
  {
    // Not the values themselves, which an entry cannot assert without restating them: the property the
    // ladder has to have is that a rung is slower than the one below, which is what makes `quick` a
    // meaningful thing to give a step. `suite` dropping under `quick` breaks it.
    why: 'the ladder climbs, so a class is slower than the one below it',
    in: 'step-timeouts',
    from: '    ms: 300_000,',
    to: '    ms: 30_000,',
    call: (lib) => {
      const ms = lib.TIMEOUT_CLASSES.map((className) => lib.TIMEOUT_MS[className].ms);
      return ms.every((value, at) => at === 0 || value > ms[at - 1]!) ? 'climbs' : 'does not climb';
    },
  },
  {
    // The bound's whole subject: a share that forgets to weigh the rung's factor is a bound against *this*
    // machine, which is the coupling the ladder was built to remove. 60s declared against `suite`'s 300s is
    // 20% here and 80% four times slower, so dropping the factor takes a passing step from 0.8 to 0.2 — and
    // every step in the table would pass a bound that had stopped asking the question
    why: 'declaredShare weighs a cost by its rung\'s stretch factor, not against the deadline alone',
    in: 'step-timeouts',
    from: '  (seconds * 1000 * TIMEOUT_MS[className].stretches) / TIMEOUT_MS[className].ms;',
    to: '  (seconds * 1000) / TIMEOUT_MS[className].ms;',
    call: (lib) => lib.declaredShare(60, 'suite'),
  },
  {
    /**
     * The gate this change exists to create. The cost and the machine were one optional argument, so the
     * arm with no cost had no machine and said "usually wedged rather than slow" on any box — the last
     * ungated verdict, in the arm four of five call sites reach, and in `bounded.ts`, the path most likely
     * to be running on someone else's machine.
     */
    why: 'the no-cost arm asks whether this is the machine the ladder was sized against',
    in: 'step-timeouts',
    from: 'return here',
    to: 'return true',
    call: (lib) => lib.timedOutBecause({
      what: 'bash x.sh',
      timeout: 'scenario',
      measuredOn: { cpu: 'Measured CPU', cores: 10 },
      machine: { cpu: 'Some Smaller CPU', cores: 4 },
    }),
  },
  {
    /**
     * The discriminator rather than either sentence, because the sentences move and this does not: an
     * assumed rung asks the reader to record this run, a measured one reports a finding and asks for
     * nothing. Swapping the test sends an assumed rung down the measured branch, which interpolates an
     * absent `measured` — so the two answers differ on wording the cases in `chain-graph` pin exactly.
     */
    why: 'rungTerms tells an assumed rung from a measured one, so only one of them asks for a recording',
    in: 'step-timeouts',
    from: '(rung.measured === undefined',
    to: '(rung.measured !== undefined',
    call: (lib) => lib.timedOutBecause({
      what: 'typecheck:fe',
      timeout: 'quick',
      seconds: 10,
      measuredOn: { cpu: 'Measured CPU', cores: 10 },
      machine: { cpu: 'Some Smaller CPU', cores: 4 },
    }),
  },
  {
    why: 'timeoutText says a class in seconds, not milliseconds',
    in: 'step-timeouts',
    from: '`${TIMEOUT_MS[className].ms / 1000}s (${className})`',
    to: '`${TIMEOUT_MS[className].ms}s (${className})`',
    call: (lib) => lib.timeoutText('quick'),
  },
  /**
   * The window's four decisions. Each one is the difference between a contended reading being rejected and
   * being adopted, and before 2026-10-03 none of them existed — a cost was one number and the newest
   * reading replaced it.
   */
  {
    // The tie rule, which is where this departs from the textbook median on purpose: averaging the two
    // middles lets one extreme reading carry the answer half its own distance, which across an edge is the
    // defect the window is for. Caught by a replay case in `suite-split` on the first run.
    why: 'costOf answers a tied window with the incumbent, not the mean of the two',
    from: 'if (samples.length === 2) return samples[0]!;',
    to: '',
    call: (lib) => lib.costOf([2_041, 4_000]),
  },
  {
    why: 'costOf takes the middle reading, so one of three cannot move it',
    from: 'return sorted[Math.floor(sorted.length / 2)]!;',
    to: 'return sorted[sorted.length - 1]!;',
    call: (lib) => lib.costOf([100, 9_999, 110]),
  },
  {
    why: 'a window keeps WINDOW readings, so it drops the oldest rather than growing',
    from: '[...samples, reading].slice(-WINDOW)',
    to: '[...samples, reading]',
    call: (lib) => lib.appendSample([1, 2, 3], 4),
  },
  {
    // Without this a quiet run appends a reading that says nothing, which is the churn the band exists to
    // prevent — and three agreeing readings then push the one real reading out of the window
    why: 'settle drops a reading that agrees with the median instead of keeping it',
    from: ': worthKeeping(spec, costOf(before), ms) ? appendSample(before, ms) : before;',
    to: ': appendSample(before, ms);',
    call: (lib) => lib.settle({
      previous: before({ [FAST]: 1_000 }),
      costs: { [FAST]: 1_050 },
      skipped: [],
      measuredFiles: [FAST],
      prune: [],
      forgetWindows: false,
    }).record.samples[FAST],
  },
  {
    /**
     * The clause that makes the window reach the specs placement is about. The band is 35% of the cost and the
     * edge is fixed, so for a cost near the edge the band is wider than the distance to it — 7 of 363 fast
     * specs could not keep a crossing at all. Dropping the edge half leaves `disagrees` alone, which drops
     * 2600 against a recorded 2186.
     */
    why: 'worthKeeping keeps a reading that crosses the edge, not only one outside the band',
    in: 'spec-cost',
    from: '  || (recorded !== undefined && halfFor(file, recorded) !== halfFor(file, measured));',
    to: '  || false;',
    call: (lib) => lib.worthKeeping('tests/x.spec.ts', 2_186, 2_600),
  },
  {
    /**
     * The half of the bound that reads the measurement. Dropping the guard makes it report a step whose
     * *declaration* is already over, which is `chain-graph.spec.ts`' failure and not this report's — so the
     * run would say the same thing twice, in the weaker place, and a reader would not know which to act on.
     */
    /**
     * Dropping the filter hands every reader a killed step's deadline as its cost — `--record` writes it into
     * source, and `declaredShare` makes a wedged `suite` step four times its rung. The number is right and it
     * is not a measurement.
     */
    why: 'measurementsFrom leaves out a step whose time is the deadline it was killed at',
    in: 'step-timing',
    from: 'results.filter((result) => result.timedOut !== true)',
    to: 'results',
    call: (lib) => [...lib.measurementsFrom([
      { step: 'compile', ms: 13_000 },
      { step: 'test:integration', ms: 300_400, timedOut: true },
    ])],
  },
  {
    why: 'outgrownRungs leaves a declaration that is already over to the spec that gates on it',
    in: 'step-timing',
    from: '    if (declaredShare(step.seconds, step.timeout) > 1) continue;',
    to: '',
    call: (lib) => lib.outgrownRungs(
      [{ name: 'greedy', dependsOn: [], seconds: 20, timeout: 'quick' }],
      new Map([['greedy', 20_000]]),
      10,
      { cpu: 'Apple M1 Pro', cores: 10 },
      { cpu: 'Apple M1 Pro', cores: 10 },
    ),
  },
  {
    /**
     * The gate that makes the number mean anything. `declaredShare` projects onto a machine `stretches`
     * times slower, so a reading from a slower box counts the slowdown twice — measured, a green run on the
     * 4x-slower runner puts 17 of 29 steps past rungs their declarations sit well inside. Without this the
     * report fires hardest on the machines where `--record`, its own advice, refuses.
     */
    why: 'outgrownRungs answers only on the schedule the table was measured on',
    in: 'step-timing',
    from: '  if (!isMeasuredSchedule(budget, measuredOn, machine)) return [];',
    to: '',
    // 60s declared is 0.80 of `suite`; the reading is that same cost on a box four times slower, so the only
    // thing that could report it is the double count
    call: (lib) => lib.outgrownRungs(
      [{ name: 'test:integration', dependsOn: [], seconds: 60, timeout: 'suite' }],
      new Map([['test:integration', 240_000]]),
      4,
      { cpu: 'Apple M1 Pro', cores: 10 },
      { cpu: 'Some Smaller CPU', cores: 4 },
    ),
  },
  {
    why: 'forgetsWindows needs both flags, so --all alone keeps the history that rejects a bad reading',
    from: 'input.all && input.forget',
    to: 'input.all',
    call: (lib) => lib.forgetsWindows({ all: true, forget: false }),
  },
  {
    why: 'a crossing is reported only while the median has not adopted it',
    from: "return belongs !== halfOfPath(file) && halfFor(file, median) === halfOfPath(file)",
    to: "return belongs !== halfOfPath(file)",
    call: (lib) => lib.provisional('tests/x.spec.ts', [4_000, 4_000]),
  },
  {
    why: 'describeBudget tells the two kinds apart',
    from: "over.length > 0 ? 'Make it cheaper, or record it in EXPENSIVE_BY_NATURE with what makes it expensive.' : '',",
    to: "over.length > 0 ? '' : '',",
    call: (lib) => lib.describeBudget([{ kind: 'over', file: FAST, ms: 9_999 }], 'a-suite-with-no-entries'),
  },
  /**
   * `core-budget.ts`'s eight. What a step takes of the machine is the chain's admission weight, so a wrong
   * answer here is an over- or under-admitted chain rather than a failure, which is why none of these has a
   * case that would notice.
   *
   * Every one passes `cores` explicitly. The parameter exists so a case can ask about a ten-core box from
   * whatever box it runs on, and an entry that let it default would be an entry about this machine.
   *
   * **`UNCAPPED` is a `Symbol`, so the mutant module has its own.** Nothing here passes one across the
   * seam: each entry names a step and lets `POOL_WIDTH` resolve the width inside the module being asked.
   */
  {
    why: 'coresFor weighs a step with no declared width at one core',
    in: 'core-budget',
    from: 'if (width === undefined) return 1;',
    to: 'if (false) return 1;',
    // `typecheck` declares no width. Without the arm it falls to `'cores' in undefined`, which throws
    call: (lib) => lib.coresFor('typecheck', 10),
  },
  {
    why: 'an uncapped pool takes one less than the box, which is vitest’s default',
    in: 'core-budget',
    from: 'if (width === UNCAPPED) return Math.max(1, cores - 1);',
    to: 'if (width === UNCAPPED) return Math.max(1, cores);',
    // 9 against 10. The whole claim the symbol makes is the `- 1`, and nothing else in the repo reads it
    call: (lib) => lib.coresFor('test:unit:host', 10),
  },
  {
    why: 'a fixed width is clamped to the machine, so it cannot exceed the budget it is spent from',
    in: 'core-budget',
    from: 'Math.min(width.cores, cores)',
    to: 'width.cores',
    // A one-core box against `compile`'s two: 1 against 2. On any box wider than the width the clamp is
    // invisible, which is why this asks about the smallest machine rather than a plausible one
    call: (lib) => lib.coresFor('compile', 1),
  },
  {
    why: 'a share rounds to the nearest core rather than down',
    in: 'core-budget',
    from: 'Math.round(width.share * cores)',
    to: 'Math.floor(width.share * cores)',
    // An **odd** box, which is what makes the rounding observable at all: half of nine is 5 rounded and 4
    // floored. Both of `core-budget.spec.ts`'s share cases use even counts, so neither can see this
    call: (lib) => lib.coresFor('test:integration', 9),
  },
  {
    why: 'a machine with the measured CPU but different cores is not the measured machine',
    in: 'core-budget',
    from: 'machine.cores === measuredOn.cores && ',
    to: '',
    call: (lib) => lib.isMeasuredMachine({ cpu: 'Apple M1 Pro', cores: 10 }, { cpu: 'Apple M1 Pro', cores: 8 }),
  },
  {
    // The hole the CPU was added to close, and the one that actually turned up: a 10-core Mac is the
    // commonest shape there is, so before this conjunct every one of them read as the box the costs came
    // from, and got `--record`, the drift instruction and the placement gate against someone else's silicon
    why: 'a machine with the measured cores but different silicon is not the measured machine',
    in: 'core-budget',
    from: ' && machine.cpu === measuredOn.cpu',
    to: '',
    call: (lib) => lib.isMeasuredMachine({ cpu: 'Apple M1 Pro', cores: 10 }, { cpu: 'Intel Xeon W', cores: 10 }),
  },
  {
    why: 'a run spending fewer cores than the table was measured at is not the measured schedule',
    in: 'core-budget',
    from: "budget === measuredOn.cores ? undefined : 'budget'",
    to: 'undefined',
    // `--cores 4` on the measured machine. The widths are still box-sized, so the costs do not describe it
    call: (lib) => lib.isMeasuredSchedule(4, { cpu: 'Apple M1 Pro', cores: 10 }, { cpu: 'Apple M1 Pro', cores: 10 }),
  },
  {
    // The entry the predicate's split created. Dropping the machine branch leaves a schedule check that asks
    // only about the budget, which is what comparing the budget alone did before the machine existed --
    // and the budget matches here, so nothing else is left to refuse it.
    //
    // Both anchors moved when `isMeasuredSchedule` became a delegation to `scheduleMismatch`: the decisions
    // are in that function now. The harness said so rather than passing over two entries that no longer
    // matched anything, which is the whole reason it asserts each anchor matches exactly once.
    why: 'the schedule check asks the machine question as well as its own',
    in: 'core-budget',
    from: "if (!isMeasuredMachine(measuredOn, machine)) return 'machine';",
    to: '',
    call: (lib) => lib.isMeasuredSchedule(10, { cpu: 'Apple M1 Pro', cores: 10 }, { cpu: 'Intel Xeon W', cores: 10 }),
  },
  /**
   * The three decisions that let a machine which is not the record's still contribute to it. They are what
   * makes the `unrecorded` finding satisfiable by a second developer, so a break in any of them puts that
   * person back to writing their own box's milliseconds into someone else's table.
   */
  {
    why: 'recordMembership lists a spec that has appeared, and prices nothing',
    from: 'const appeared = unrecorded(withCosts({ ...forStorage(previous), samples, skipped }), files);',
    to: 'const appeared: string[] = [];',
    call: (lib) => lib.recordMembership(before({ [FAST]: 100 }), [FAST, 'tests/new.spec.ts']).unmeasured,
  },
  {
    why: 'readSpecCost treats a record missing a field as absent, not as a record',
    from: 'return complete ? withCosts(parsed) : undefined;',
    to: 'return withCosts(parsed);',
    // `holed` has no `machine`. Without the gate the caller gets an object whose fields it then reads as
    // if they were measured, where `undefined` is what routes it to "run spec-cost:update"
    call: (lib, tree) => lib.readSpecCost(tree.root, 'holed'),
  },
  {
    why: 'settle drops a spec from unmeasured once this run has priced it',
    from: 'sorted[file] === undefined && ',
    to: '',
    // `b` was unmeasured and this run measured it. Without the clause it keeps its place in the list while
    // holding a cost, so the record says both that it is priced and that it has never been measured here
    call: (lib) => lib.settle({
      previous: before({ [FAST]: 100 }, [], ['tests/b.spec.ts']),
      costs: { [FAST]: 100, 'tests/b.spec.ts': 500 },
      skipped: [],
      measuredFiles: [FAST, 'tests/b.spec.ts'],
      prune: [],
      forgetWindows: false,
    }).record.unmeasured,
  },
];

/**
 * A value or the message it threw, so a break that turns a refusal into a return still compares.
 *
 * **It awaits, and that is not a convenience.** `Mutation.call` returns `unknown`, so a subject that is
 * async type-checks and then compares wrongly: vitest's `toEqual` reads two distinct Promises as *equal* —
 * no own enumerable keys, and its `className` switch has no Promise case — so `.not.toEqual` would fail
 * every async entry unconditionally, reporting "breaking this changed nothing" about a break that worked.
 * Two further hazards go with it: a `try/catch` around an un-awaited call cannot catch a rejection, so a
 * mutation that makes the subject reject becomes an unhandled rejection rather than `{ threw }`; and an
 * unsettled promise leaves work running past the case.
 *
 * Awaiting a non-thenable is identity, so the entries that are synchronous are unaffected — checked by
 * running all of them before and after, by name, not by the absence of a failure.
 */
const outcome = async (run: () => unknown): Promise<unknown> => {
  try {
    return { ok: await run() };
  } catch (error) {
    return { threw: (error as Error).message.slice(0, 120) };
  }
};

describe('every decision these modules make is one something can see', () => {
  const tree: Tree = { root: '' };
  const sources = new Map<Module, string>();

  beforeAll(() => {
    for (const [name, { file }] of Object.entries(MODULES)) {
      sources.set(name as Module, fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'lib', file), 'utf-8'));
    }
    (tree as { root: string }).root = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-mutations-'));
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
    write(realSpecCost.specCostFile('mini'), `${JSON.stringify({ measuredAt: 'then', costs: { [FAST]: 100 }, skipped: [], unmeasured: [], machine: realCoreBudget.thisMachine() }, null, 2)}\n`);
    // A record from before `machine` landed, which is what a branch not yet rebased, a stash or a revert
    // hands `readSpecCost`. No live suite is in this state either, and the gate has no other input.
    //
    // **Its windows are well-formed and only `machine` is absent**, which is what makes the gate the thing
    // under test: a record whose `samples` are missing throws inside `withCosts` instead, and
    // `readSpecCost`'s own `catch` turns that back into the same `undefined` the gate returns — so a
    // fixture broken that way cannot tell the two apart. It was, and the harness said so.
    write(realSpecCost.specCostFile('holed'), `${JSON.stringify({
      measuredAt: 'then', samples: { 'tests/a.spec.ts': [100] }, skipped: [], unmeasured: [],
    }, null, 2)}\n`);
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

    expect(await outcome(() => call(mutant, tree)),
      'breaking this changed nothing the case looks at, so the case is watching something else')
      .not.toEqual(await outcome(() => call(MODULES[where].real, tree)));
  });
});
