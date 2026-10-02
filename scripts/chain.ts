// The pre-merge chain: every check, in order, with per-step timings.
//
//   npm run chain
//
// It exists for the timings and the failure output, not for speed. Each step's output is buffered and
// printed only if it fails, so a failure is not buried under six passing suites, and the summary says
// where the time went — which otherwise has to be reconstructed from log file mtimes.
//
// WHY THE STEPS ARE NOT RUN IN PARALLEL
//
// They look parallelisable: after `packages:ensure` and `build`, nothing writes what another step reads,
// each app launch takes its own port (`getPort` in main's `ApiServer`) and its own data dir (`mkdtemp` in
// `@abuddy/testing`), and `ensurePackagesBuilt` returns before taking the build lock when nothing is
// stale. All of that is true. It still does not pay, measured on this machine (2026-09-24, M-series):
//
//   serial, 7 steps                             wall 348s   work 348s   passed
//   3 lanes, test:packaged-authoring in a lane  wall 168s   work 268s   FAILED
//   3 lanes, test:packaged-authoring alone      wall 258s   work 567s   FAILED
//
// The first failure is shared state the step names do not admit to: `test:packaged-authoring` runs
// `npm run packages:build` as its own first step (`tests/scripts/test-packaged-authoring.sh`), so it
// deletes and rewrites the `dist/` every other step reads. `ABUDDY_PACKAGES_PREBUILT=1` now reports that
// rather than racing it.
//
// The second is the machine. Lanes oversubscribe rather than overlap: total work went from 348s to 567s,
// `@abuddy/cli` went from 56s to 118s, and it began reporting errors it does not report alone. Wall time
// fell, but only by doing 60% more work, and failing.
//
// So the constraint is cores, not ordering, and the way to a shorter chain is a cheaper step, not a
// rearranged one. Reopen this on a machine with idle cores, and measure rather than trust the arithmetic:
// max() assumes steps do not slow each other, and here they do.
//
// ONE PREMISE OF THAT ARGUMENT WAS WRONG (2026-09-27)
//
// It read "every step already uses all the cores — vitest runs its files across workers, tsc forks per
// project". The second half was false, and `typecheck` was the largest app-free step: sixteen legs chained with
// `&&`, each a single-threaded compiler, so it held one core for half a minute while nine sat idle — which is
// also why it was the step most starved by the lanes put there to use them. Running its legs at once took it
// from 29.3s to 10.8s alone (`scripts/typecheck.ts`).
//
// That does not overturn the measurement above, which stands: three lanes over seven steps still cost 60% more
// work. It narrows what it means. "The constraint is cores" is right; "every step already uses them" was an
// assumption, and the cheapest work left in this chain may be another step that is quietly serial.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { changedInputs, diffableStamp, firstChange, freshnessSweep, INPUTS_CHANGED, REPO_ROOT, stampedRun, stampRecord, unitStaleReason, type BuildUnit } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS, type ChainStep, chainSteps, MEASURED_AT_LANES, needsApp, orderedSteps, STEP_TABLES } from './lib/chain-steps.ts';
import { commandText, rootScripts } from './lib/npm-scripts.ts';
import { IDLE_FLOOR, idleNow, movedBeyondBand, refusesAsBusy } from './lib/measure.ts';
import { recordSeconds } from './lib/record-seconds.ts';
import { schedule } from './lib/chain-schedule.ts';
import { criticalPath, driftedSteps, willNotCache } from './lib/step-timing.ts';
import { briefly, classifyLine, declaredAt, dim, driftReport, DRY_REASON_COLUMN, howLong, identicalRewrites, marker, oneLine, REASON_COLUMN, shouldClassify, staleLines, STEP_NAME_WIDTH, TIME_COLUMN, whenChanged, wrapAt, writerOf } from './lib/chain-output.ts';
import { slowestTests } from './lib/slow-tests.ts';
import { exitOnEpipe } from './lib/exit-on-epipe.ts';

exitOnEpipe();

import { boundedSpawn, budgetFor } from './lib/bounded-spawn.ts';

/**
 * Each step is cached on its own declared inputs, through the same protocol the package builds use:
 * `fingerprintUnit` over `ChainStep.inputs`, `unitStaleReason` to decide, `stampedRun` to record. One
 * protocol, one fingerprint, one reader — which is why the chain's stamps live beside the
 * builds' rather than inventing a second format.
 *
 * This replaces a whole-tree fingerprint, which skipped the chain only when nothing tracked had changed at
 * all. The argument for that was that every expensive step transitively reads nearly the whole repo, and
 * for the steps that need the app it is still true: they read it, so a change anywhere in it re-runs them.
 * What it missed is that most of the chain needs no app. The eight unit suites read their own package and
 * its dependencies' source, so a one-package edit re-runs one suite; a doc edit re-runs nothing.
 *
 * There is no cascade rule, and there does not need to be one. A step that produces something declares it
 * in `outputs`, and the steps that read it declare those same paths in their `inputs`, so a rebuild that
 * changed the output changes the dependents' fingerprints — and a rebuild that produced identical bytes
 * leaves them fresh, which is the right answer and one a "needed step ran" rule would get wrong.
 */
const STAMP_DIR = path.join(REPO_ROOT, 'node_modules', '.cache', 'abuddy-chain');

/**
 * Where a run points when it says a step is never cached: the sentence is there, the argument above it.
 *
 * Both tables, because a step is declared in either — this searched only `chain-steps.ts` and so could not
 * locate the seventeen typecheck legs or the two generated pool steps. Read once, at module load, rather
 * than per row.
 */
const stepTables = STEP_TABLES.map((file) => ({ file, source: fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8') }));
const declaredIn = (name: string): string | undefined => {
  for (const { file, source } of stepTables) {
    const line = declaredAt(source, name);
    if (line !== undefined) return `${file}:${line}`;
  }
  return undefined;
};
const stampFor = (step: string): string => path.join(STAMP_DIR, `${step.replace(/[:/]/g, '-')}.json`);

/**
 * Drop stamps for steps that no longer exist, and for steps that are not cached.
 *
 * A stamp is a record *about* a step, so one whose step has gone is a record with no subject — and this
 * chain found a real one: `typecheck.json` outlived the step by the time it became eighteen. Harmless on
 * its own, and exactly the shape the rest of this work removes, which is reason enough not to keep it.
 *
 * The uncached case is the one that would be a bug rather than litter. A step declaring
 * `neverCachedBecause` must never be skipped on a stamp, and `runAndStamp` returns before `stampedRun`
 * for one — so a stamp for such a step means that branch stopped holding. Clearing it here keeps the
 * store true to the table; `chain-stamps.spec.ts` is what fails if the branch breaks.
 */
function pruneStamps(): void {
  if (!fs.existsSync(STAMP_DIR)) return;
  const live = new Map(CHAIN_STEPS.map((step) => [path.basename(stampFor(step.name)), step]));
  for (const file of fs.readdirSync(STAMP_DIR)) {
    if (!file.endsWith('.json')) continue;
    const step = live.get(file);
    if (step === undefined || step.neverCachedBecause !== undefined) fs.rmSync(path.join(STAMP_DIR, file));
  }
}

/** A step as a build unit: the same shape, so it goes through the same freshness check */
/** What a finished step may have changed: its products, and the paths it writes without producing one */
const wrote = (step: ChainStep): string[] =>
  [...(step.outputs ?? []), ...(step.alsoWrites ?? [])].map((target) => path.join(REPO_ROOT, target));

const unitFor = (step: ChainStep): BuildUnit => ({
  inputs: step.inputs.map((input) => path.join(REPO_ROOT, input)),
  outputs: (step.outputs ?? []).map((output) => path.join(REPO_ROOT, output)),
  excludes: (step.excludes ?? []).map((excluded) => path.join(REPO_ROOT, excluded)),
  // What `npm run <name>` resolves to, which is what `package.json` used to be in every step's inputs for
  command: commandText(step.name, rootScripts()),
});

type Result = { step: string; ms: number; code: number; output: string; timedOut?: true };

/**
 * What moved under a step's inputs since its last successful run, against that run's own stamp.
 *
 * Everything here is the stamp's: the per-file digests it recorded, the declared set it recorded, and the two
 * timestamps bracketing the run. So the files named are exactly the ones the verdict is about — the previous
 * version walked mtimes instead and named a file a test rewrites with identical bytes, which sent a diagnosis
 * after the wrong thing. mtime is still read, but only to place a change the digests already found.
 *
 * Asked only of a step already known to be stale, so its walk and its stats are paid on the runs with
 * something to report — and over the same sweep that reached the verdict, so the digests are already read rather
 * than walked a second time.
 */
function whatMoved(
  step: ChainStep,
  steps: readonly ChainStep[],
  asking: { changedInputs: typeof changedInputs },
): Omit<Parameters<typeof staleLines>[0], 'name' | 'nameWidth' | 'reason'> {
  const nothing = { gained: [], lost: [], files: [], identical: [] };
  // An undiffable stamp is required of the types and unreachable from here, which is worth saying rather than
  // leaving as a fallback someone trusts: this is asked only of a step that *passed* in this run, and a step
  // that passed rewrote its own stamp a moment ago with every field in it. The state it stands for — a stamp
  // from before the digests were recorded, or one in a shape its reader refuses — is reachable only by whoever
  // asks about a run they did not just watch, which is `--dry`, the question "why would this run?". That is
  // where naming the files would pay next, and it would make this branch live.
  const { stamp: record, undiffable } = diffableStamp(stampRecord(stampFor(step.name)));
  if (record === undefined) return { ...nothing, undiffable };
  const changes = asking.changedInputs(unitFor(step), record);
  const at = (file: string) => {
    try {
      return fs.statSync(path.join(REPO_ROOT, file)).mtimeMs;
    } catch {
      return undefined; // gone between the diff and this stat, which the diff already called removed
    }
  };
  const asOf = (field: string | undefined) => (field === undefined ? undefined : Date.parse(field));
  const [from, until] = [asOf(record.takenAt), asOf(record.builtAt)];
  const files = ([
    ...changes.changed.map((file) => ({ file, how: 'changed' as const })),
    ...changes.added.map((file) => ({ file, how: 'added' as const })),
    ...changes.removed.map((file) => ({ file, how: 'removed' as const })),
  ]).map((found) => ({ ...found, when: whenChanged(at(found.file), from, until), writer: writerOf(found.file, steps) }))
    // What ran beside this step comes first: it is the case with an ordering to fix, where a change since the
    // run is usually the edit you just made
    .sort((a, b) => Number(a.when !== 'while it ran') - Number(b.when !== 'while it ran'));
  const identical = identicalRewrites({
    recorded: Object.keys(record.files),
    differing: new Set(files.map((found) => found.file)),
    mtimeOf: at,
    from,
    until,
  });
  // `undefined` rather than omitted: the field is required so that a caller which has read the stamp says so
  return { gained: changes.gained, lost: changes.lost, files, identical, undiffable: undefined };
}

/**
 * A step, under a budget sized from what it costs healthy. An overrun kills its whole process group.
 *
 * `force` carries the step's `forceArgs` when the chain was given `--all`. A step that keeps a cache of its
 * own cannot see this chain's override, so without them `--all` runs the step and the step skips its work:
 * the two unit pools did exactly that. Only steps that declare them get any, because most steps' commands
 * would reject an argument they do not know.
 */
async function run(step: string, seconds: number | undefined, force: readonly string[] = []): Promise<Result> {
  // `npm test` is the E2E suite and takes no `run`
  const args = step === 'test' ? ['test'] : ['run', step];
  // npm forwards what follows `--` to the script's own command, which is how this chain was given `--all`
  const withForce = force.length === 0 ? args : [...args, '--', ...force];
  // A step with no measurement still gets a bound, just a loose one
  const { code, output, ms, timedOut } = await boundedSpawn('npm', withForce, budgetFor(seconds ?? 300));
  return { step, ms, code, output, timedOut };
}


const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;


/** Thrown to leave `stampedRun` without a stamp: a failed step must read as never run */
class StepFailed extends Error {
  constructor(readonly result: Result) { super(result.step); }
}

/**
 * The step, with its stamp written only where it passed. The fingerprint is taken before it runs, so a
 * source edited mid-run records as not done rather than as covered.
 */
async function runAndStamp(step: ChainStep, all: boolean): Promise<Result> {
  const force = all ? step.forceArgs ?? [] : [];
  if (step.neverCachedBecause !== undefined) return run(step.name, step.seconds, force);
  let result: Result | undefined;
  try {
    await stampedRun(step.name, unitFor(step), stampFor(step.name), async () => {
      result = await run(step.name, step.seconds, force);
      if (result.code !== 0) throw new StepFailed(result);
    });
  } catch (err) {
    if (!(err instanceof StepFailed)) throw err;
    return err.result;
  }
  return result!;
}


/**
 * How many steps may run at once. **Three, re-measured 2026-09-25 against the pooled step shape:**
 *
 *     lanes 1   261.2s                    0 failures
 *     lanes 2   207.6s, 192.3s            0 failures
 *     lanes 3   157.8s, 161.8s, 156.1s    0 failures
 *     lanes 4   159.6s                    0 failures
 *
 * This reverses what `goal-test-tiers.md` settled, and the cause is known rather than guessed. That
 * measurement had three lanes slower than two *and* failing, and what failed was a test timing out at
 * vitest's 5s default — `findLmdbImports > holds for the repo` at 5220ms, a whole-repo scan that takes ~2s
 * alone. The cap was the timeout, not the cores. `goal-one-job-pool.md` Phase 5 replaced that default with
 * the size budgets, 15s and 60s, and the third lane became both faster and green.
 *
 * Four is not better than three: the critical path is 106-112s, so three lanes at ~157s is already close to
 * the floor and more lanes have nothing left to overlap. Re-measure this when the step shape changes again
 * — it is tuned to eleven steps, two of which are the unit pools, and it was tuned to seventeen before.
 */
/** What `--lanes` defaults to, named so the timing table can be checked against it */
const DEFAULT_LANES = 3;

function laneCount(): number {
  const flag = process.argv.indexOf('--lanes');
  const value = flag === -1 ? DEFAULT_LANES : Number(process.argv[flag + 1]);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--lanes takes a positive integer, not ${String(process.argv[flag + 1])}`);
  return value;
}

async function main(): Promise<void> {
  const started = Date.now();
  const results: Result[] = [];
  const all = process.argv.includes('--all');
  // What the chain would do, without doing it. The answer is a pure function of the tree, so it is the way
  // to check the cache on a machine too loaded to time a run on — and the way to find out why a step you
  // expected to be cached is not. It reports each step against the tree as it stands, so the verdicts after
  // the first step that would run are what that step would produce nothing for: a plan, not a prediction.
  const dry = process.argv.includes('--dry');
  // The retry costs the failing step's own time before the verdict appears, and most failures are the ordinary
  // kind where the reader already knows what they broke
  const noClassify = process.argv.includes('--no-classify');
  // The E2E suite is a harness for driving the app rather than a gate, so it runs when asked for
  const e2e = process.argv.includes('--e2e');
  let cached = 0;

  // Derived from each step's `needs`, and validated first: an unknown dependency or a cycle fails here rather
  // than halfway through a six-minute run
  const steps = orderedSteps(chainSteps(e2e ? ['test'] : []));
  const lanes = laneCount();

  /** Its verdict, asked at dispatch — see `dispatch` for why that timing is load-bearing */
  /**
   * Why a step would run. `asking` is how it reads the tree: the default reads per step, and a sweep reads once
   * for all of them.
   *
   * **Every caller shares one, and the derived graph is what makes that sound.** A reader of a step's output
   * is ordered after it by construction, so a sweep — which reads lazily — never holds bytes a later step
   * overwrites. That property was hand-maintained when `needs` was written beside the inputs implying it;
   * it is definitional now, which is what retired the per-step reads.
   *
   * Measured on an unchanged tree: 28 decisions cost 1715ms read per step and 189ms through one sweep, which
   * is the whole cost of a run where nothing runs.
   */
  const staleReason = (step: ChainStep, asking = { staleReason: unitStaleReason }): string | null =>
    step.neverCachedBecause !== undefined
      ? `never cached: ${step.neverCachedBecause}`
      : asking.staleReason(unitFor(step), stampFor(step.name));

  if (dry) {
    // One question about every step, and nothing runs while it is asked, so one reading of the tree answers it all
    const sweep = freshnessSweep();
    /**
     * What moved, for the one step being asked about — the same diff the post-run report prints, minus the
     * stats, because `--dry` places nothing in time: there is no run to be inside or after.
     *
     * Asked only of a step that is stale for the ordinary reason, so a warm tree pays for nothing and a cold
     * one pays a hash per stale step over bytes this sweep has already read. This is the caller that makes the
     * no-digests case real: it reads stamps it did not write, and one from before those were recorded cannot
     * say which input moved.
     */
    const whatChanged = (step: ChainStep): string => {
      const { stamp: record, undiffable } = diffableStamp(stampRecord(stampFor(step.name)));
      // Its reader's own sentence, rather than a second copy of one. The copy that was here could not print
      // the wrong thing — this is asked only where `why === INPUTS_CHANGED` below, so the fingerprint is a
      // string and only the two record clauses are reachable — but it was a literal kept in step with
      // `diffableStamp`'s by nothing, and there were three of them in three files.
      if (record === undefined) return undiffable;
      return firstChange(sweep.changedInputs(unitFor(step), record));
    };
    for (const step of steps) {
      // `--all` runs everything, so a dry run given `--all` must say so rather than reporting the cache it
      // would ignore. A plan that does not answer for the flags it was given is worse than no plan.
      const why = staleReason(step, sweep);
      const willRun = all || why !== null;
      // Naming what moved in place of the sentence, which was the same for every stale step and said less
      const moved = !all && why === INPUTS_CHANGED ? whatChanged(step) : '';
      const reason = all ? '--all' : (moved === '' ? (why ?? '') : moved);
      console.log(`${(willRun ? 'run' : 'cached').padStart(7)} ${marker(needsApp(step))} ${step.name.padEnd(STEP_NAME_WIDTH)} ${wrapAt(DRY_REASON_COLUMN, reason)}`.trimEnd());
    }
    return;
  }

  /** The reason a step ran, kept for its line and for the failure report */
  const reasons = new Map<string, string>();
  /**
   * One reading of the tree for every dispatch decision, kept honest by forgetting what each step writes.
   *
   * `packages:ensure` is why this cannot simply be a snapshot: it is never cached, so it runs on every
   * invocation, and when it rebuilds anything its readers must compare against the new bytes rather than the
   * ones this sweep read before it started.
   */
  const dispatchSweep = freshnessSweep();
  pruneStamps();
  const outcome = await schedule({
    steps,
    lanes,
    skip: (step) => {
      const why = staleReason(step, dispatchSweep);
      if (!all && step.neverCachedBecause === undefined && why === null) {
        cached++;
        // On its own line where it was skipped, and dimmed. The order these arrive in is information — it is
        // when the scheduler reached the step — so they are not collected and printed together at the end;
        // the weight is what separates them from the rows that did work, not the position.
        console.log(dim(`${'cached'.padStart(7)} ${marker(needsApp(step))} ${step.name}`));
        return true;
      }
      reasons.set(step.name, all ? '--all' : (why ?? ''));
      return false;
    },
    run: async (step) => {
      const result = await runAndStamp(step, all);
      // A net rather than the mechanism: the graph already orders every reader of these paths after this
      // step, so nothing has read them yet. It costs a map scan and it is what a step reading something it
      // is *not* ordered after would need — see `freshnessSweep`'s note on what it cannot distinguish.
      dispatchSweep.forget(wrote(step));
      results.push(result);
      // TIMEOUT is its own verdict: a step that ran out of budget failed for a different reason than one
      // that returned non-zero, and which it was is the first thing you need to know.
      const verdict = result.code === 0 ? 'ok' : result.timedOut ? 'TIMEOUT' : 'FAIL';
      console.log(`${verdict.padStart(7)} ${marker(needsApp(step))} ${step.name.padEnd(STEP_NAME_WIDTH)} ${secs(result.ms).padStart(6)}  ${wrapAt(REASON_COLUMN, briefly(reasons.get(step.name) ?? '', declaredIn(step.name)))}`.trimEnd());
      // So whoever profiles a suite next has its slow tests without instrumenting it
      // In the step's own time column, so every time on the screen lines up and these read as its contents
      for (const slow of slowestTests(result.output)) {
        console.log(dim(`${' '.repeat(TIME_COLUMN)}${secs(slow.ms).padStart(6)}  ${oneLine(REASON_COLUMN, slow.name)}`));
      }
      return result.code === 0;
    },
  });

  // A step whose runner threw never produced a Result, so it is reported from the throw itself
  for (const { step, error } of outcome.threw) {
    const threw = steps.find((candidate) => candidate.name === step);
    console.log(`${'ERROR'.padStart(7)} ${marker(threw !== undefined && needsApp(threw))} ${step.padEnd(STEP_NAME_WIDTH)} ${' '.repeat(6)}  the chain could not run it`);
    console.log(`\n${'='.repeat(72)}\n${step}: the runner threw, which is a bug in the chain rather than a failing check\n${'='.repeat(72)}\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  }

  // Every step is asked about at this one moment, with nothing left running, so one reading of the tree answers
  // both halves: whether each step is stale, and which of its inputs moved. A fresh sweep, never the dry one.
  //
  // Read before the retry below, which is a diagnostic rather than part of the run and may write into the tree:
  // a re-run `compile` rewrites PACK_OUTPUTS. No passed step reads a failed step's outputs today — every reader
  // of one declares `needs` on it, and the scheduler skips a failed step's dependents — but `needs` is ordering
  // and `inputs`/`outputs` are caching, so nothing makes them agree. This does not depend on their agreeing.
  const sweep = freshnessSweep();

  let classifyMs = 0;
  const failed = outcome.failed === undefined ? undefined : results.find((r) => r.step === outcome.failed);
  if (failed) {
    const step = steps.find((s) => s.name === failed.step)!;
    const classifying = shouldClassify({
      // What the schedule saw, not what the table predicts: `conflictsOf(step).length > 0` stood here and
      // meant "has a mutex partner", which twelve steps do while running beside two dozen others
      ranAlone: (outcome.peers.get(failed.step)?.size ?? 0) === 0,
      timedOut: failed.timedOut === true,
      optedOut: noClassify,
    });
    const why = failed.timedOut
      ? `${step.name} timed out: it exceeded its ${secs(budgetFor(step.seconds ?? 300))} budget and its process group was killed. It costs ${step.seconds ?? '?'}s healthy, so either it is wedged or it has grown and the measurement in chain-steps.ts is stale.`
      : `${step.name} failed (exit ${failed.code})${howLong(step, failed.ms, lanes, classifying)}`;
    console.log(`\n${'='.repeat(72)}\n${why}\n${'='.repeat(72)}\n${failed.output}`);
    if (classifying) {
      // `run`, never `runAndStamp`: a step that passes alone has not passed the chain, and stamping it here
      // would let the next run skip the thing that just failed. Nothing else is executing — `schedule` drains
      // before it returns — so this is the step by itself, which is the whole question being asked.
      //
      // Demonstrated rather than assumed, with a `compile` that fails then passes: the retry reports passing,
      // and the next chain still says `compile  no stamp — it has not run yet, or the last run failed`.
      const retry = await run(step.name, step.seconds, all ? step.forceArgs ?? [] : []);
      // The verdict reports what the chain cost. The retry is a diagnostic after it, so a 60s re-run must not
      // land on the one number a reader compares between runs.
      classifyMs = retry.ms;
      console.log(classifyLine(retry));
    }
  }

  const skipped = cached ? ` (${cached} of ${steps.length} cached)` : '';
  // Measured, not declared. Reporting the floor from `seconds` made it wrong by the amount the table had
  // drifted — 109s against the 125.8s those same four steps actually took in that run.
  const measuredMs = new Map(results.map((r) => [r.step, r.ms]));
  const ran = steps.filter((step) => measuredMs.has(step.name))
    .map((step) => ({ ...step, seconds: Math.round((measuredMs.get(step.name) ?? 0) / 1000) }));
  const path = criticalPath(ran);
  const floor = lanes > 1 && path.names.length > 1 ? `\ncritical path ${path.seconds}s (${path.names.join(' -> ')})` : '';
  // Named rather than folded in, so the verdict's number stays comparable between runs and the wall time still
  // adds up — a reader who times the command should not find seconds the chain does not account for.
  const reran = classifyMs > 0 ? ` (+${secs(classifyMs)} re-run)` : '';
  const verdict = failed ? `chain FAILED at ${failed.step}` : outcome.failed ? `chain FAILED at ${outcome.failed}` : 'chain passed';
  // Something writing into a step's inputs after it ran is why a "15 of 17 cached" chain still paid 34s
  // for a typecheck every time. Asked here, against the sweep taken above.
  const uncacheable = willNotCache(
    steps,
    new Set(results.filter((r) => r.code === 0).map((r) => r.step)),
    (step) => staleReason(step, sweep),
  );
  if (uncacheable.length > 0) {
    // What is known is that each of these stamped inputs it no longer matches; *why* is per file, on the
    // lines below, and is not always a write — it may be an edit since the run, or a declared path gained.
    // The consequence is stated as one rather than promised, since reverting the change takes it back.
    const one = uncacheable.length === 1;
    console.log(`\n${uncacheable.length} step${one ? '' : 's'} passed, then ${one ? 'its' : 'their'} inputs changed`
      + ` — ${one ? 'it' : 'they'} will not be cached next run`);
    // Sized to the names in this report rather than to the widest in the table: the block stands on its own
    // under a blank line, so it owes the rows above it no column, and a report without the longest-named step
    // in it should not be indented as though it had one
    const nameWidth = Math.max(...uncacheable.map(({ name }) => name.length));
    for (const { name, reason } of uncacheable) {
      const step = steps.find((s) => s.name === name)!;
      const unusual = reason === INPUTS_CHANGED ? undefined : reason;
      for (const line of staleLines({ name, nameWidth, reason: unusual, ...whatMoved(step, steps, sweep) })) console.log(line);
    }
    console.log(dim('  Declare what writes there in that step\'s `outputs`, or stop declaring the tree as an input.'));
  }

  // The table feeds the kill budget and the floor above, so a number a run has contradicted is worth more
  // than a note in a doc nobody re-reads
  // Every `seconds` is the cost at some lane count, so changing the default invalidates all of them at once —
  // which is what happened, silently, the day three lanes landed two hours after a number was taken under two
  if (DEFAULT_LANES !== MEASURED_AT_LANES) {
    console.log(`\nchain-steps.ts' seconds were measured at ${MEASURED_AT_LANES} lanes and this chain defaults to ${DEFAULT_LANES}.`);
    console.log('  Re-measure with `npm run chain -- --all` and set MEASURED_AT_LANES, or the table is about another schedule.');
  }

  const report = driftReport(driftedSteps(steps, measuredMs), lanes, MEASURED_AT_LANES, all);
  if (report !== '') console.log(report);

  if (process.argv.includes('--record')) recordTheCosts(steps, measuredMs, lanes, all);

  console.log(`\n${verdict} in ${secs(Date.now() - started - classifyMs)}${reran}${skipped}${lanes > 1 ? ` with ${lanes} lanes` : ''}${floor}`);
  // Not process.exit(): it drops whatever stdout has still to flush, and the failing step's captured output
  // printed just above is the one thing here worth reading. Measured: piped, process.exit() delivers 64KB
  // of a 500KB write, and @app/default-setup's suite output alone is 654KB.
  process.exitCode = outcome.failed ? 1 : 0;
}

/**
 * `--record`: write each step's measured cost back into the table it is declared in.
 *
 * The update half of a recorded artifact that had only a check. `driftReport` has always printed the
 * value to write; this writes it, under the three things a sample needs and a derivation does not.
 *
 * **It needs `--all`**, because a cached step is not a measurement — recording its 0s would give a step
 * that builds a budget sized for a step that does not, which is the mistake `seconds`' own doc describes
 * someone already making. **It refuses a busy machine**, because what you would record then is the
 * machine; `--force` is the deliberate override and says so. **And it moves a number only past the band**,
 * because a sample re-measured on an idle box still wanders, and rewriting a row that already agrees is
 * the churn the band exists to prevent.
 *
 * The band here is tighter than the one the report uses. `driftReport` speaks at twice the declared cost,
 * chosen so a slow machine does not nag; a record wants to track reality, so it follows `SETTLED_FRACTION`
 * with a one-second floor. They differ on purpose, which is why this prints everything it wrote.
 */
function recordTheCosts(steps: readonly ChainStep[], measuredMs: ReadonlyMap<string, number>,
  lanes: number, all: boolean): void {
  if (!all) {
    console.log('\n--record needs --all: a cached step reports no time, and recording that would size a budget from it.');
    return;
  }
  if (lanes !== MEASURED_AT_LANES) {
    console.log(`\n--record refused: these costs are the chain's at ${MEASURED_AT_LANES} lanes and this ran at ${lanes}.`);
    return;
  }
  const idle = idleNow();
  if (refusesAsBusy({ idle, floor: IDLE_FLOOR, force: process.argv.includes('--force') })) {
    console.log(`\n--record refused: the machine is ${Math.round(idle * 100)}% idle and this needs ${Math.round(IDLE_FLOOR * 100)}%.`);
    console.log('  What you would record now is the machine. Wait, or pass --force and know the number is forced.');
    return;
  }
  // Under a second is not a measurement of the step's work, and the one it would corrupt is named in
  // `seconds`' own doc: `packages:ensure` returns in 0.3s with the packages fresh and takes 14s when it
  // builds, so recording the 0 gives a step that builds a budget sized for a step that does not. The
  // first run of this did exactly that. `driftedSteps` skips the same measurements for the same reason.
  const measured = new Map([...measuredMs]
    .map(([name, ms]) => [name, Math.round(ms / 1000)] as const)
    .filter(([, seconds]) => seconds >= 1));
  const declared = new Map(steps.flatMap((step) => (step.seconds === undefined ? [] : [[step.name, step.seconds] as const])));
  // One second, not `SETTLED_MS`: these are seconds, and the floor is what stops the fraction chasing
  // noise on a step that costs less than a second to begin with
  const edits = recordSeconds(measured, declared, (was, now) => movedBeyondBand(was, now, 1));
  if (edits.length === 0) {
    console.log('\nevery step cost what the table says, within the band — nothing recorded');
    return;
  }
  console.log(`\nrecorded ${edits.length} step cost${edits.length === 1 ? '' : 's'}:`);
  for (const { step, from, to, file } of edits) {
    console.log(`  ${step.padEnd(STEP_NAME_WIDTH)} ${from}s -> ${to}s   ${file}`);
  }
}

// A throw here is a bug in the chain, not a failing check, and the two must not look alike
try {
  await main();
} catch (err) {
  console.error(`\nthe chain itself failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exitCode = 1;
}
