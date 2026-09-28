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
// project". The second half was false, and `typecheck` was the largest tier-1 step: sixteen legs chained with
// `&&`, each a single-threaded compiler, so it held one core for half a minute while nine sat idle — which is
// also why it was the step most starved by the lanes put there to use them. Running its legs at once took it
// from 29.3s to 10.8s alone (`scripts/typecheck.ts`).
//
// That does not overturn the measurement above, which stands: three lanes over seven steps still cost 60% more
// work. It narrows what it means. "The constraint is cores" is right; "every step already uses them" was an
// assumption, and the cheapest work left in this chain may be another step that is quietly serial.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { changedInputs, firstChange, freshnessSweep, INPUTS_CHANGED, REPO_ROOT, stampedRun, stampRecord, unitStaleReason, type BuildUnit } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS, MEASURED_AT_LANES, orderedSteps, type ChainStep, type Tier } from './lib/chain-steps.ts';
import { schedule } from './lib/chain-schedule.ts';
import { criticalPath, driftedSteps, willNotCache } from './lib/step-timing.ts';
import { briefly, declaredAt, dim, DRY_REASON_COLUMN, driftReport, howLong, identicalRewrites, oneLine, REASON_COLUMN, staleLines, STEP_NAME_WIDTH, TIME_COLUMN, whenChanged, wrapAt, writerOf } from './lib/chain-output.ts';
import { slowestTests } from './lib/slow-tests.ts';
import { exitOnEpipe } from './lib/exit-on-epipe.ts';

exitOnEpipe();

import { boundedSpawn, budgetFor } from './lib/bounded-spawn.ts';

/**
 * Each step is cached on its own declared inputs, through the same protocol the package builds use:
 * `fingerprintUnit` over `ChainStep.inputs`, `unitStaleReason` to decide, `stampedRun` to record. One
 * `STAMP_VERSION`, one fingerprint, one thing to bump — which is why the chain's stamps live beside the
 * builds' rather than inventing a second format.
 *
 * This replaces a whole-tree fingerprint, which skipped the chain only when nothing tracked had changed at
 * all. The argument for that was that every expensive step transitively reads nearly the whole repo, and
 * for the tier-3 steps it is still true: they read the built app, so a change anywhere in it re-runs them.
 * What it missed is that most of the chain is not tier 3. The eight unit suites read their own package and
 * its dependencies' source, so a one-package edit re-runs one suite; a doc edit re-runs nothing.
 *
 * There is no cascade rule, and there does not need to be one. A step that produces something declares it
 * in `outputs`, and the steps that read it declare those same paths in their `inputs`, so a rebuild that
 * changed the output changes the dependents' fingerprints — and a rebuild that produced identical bytes
 * leaves them fresh, which is the right answer and one a "needed step ran" rule would get wrong.
 */
const STAMP_DIR = path.join(REPO_ROOT, 'node_modules', '.cache', 'abuddy-chain');

/** The table a run points at when it says a step is never cached: the sentence is there, the argument above it */
const STEP_TABLE = 'scripts/lib/chain-steps.ts';
const declaredIn = (name: string): string | undefined => {
  const line = declaredAt(stepTable, name);
  return line === undefined ? undefined : `${STEP_TABLE}:${line}`;
};
const stepTable = fs.readFileSync(path.join(REPO_ROOT, STEP_TABLE), 'utf-8');
const stampFor = (step: string): string => path.join(STAMP_DIR, `${step.replace(/[:/]/g, '-')}.json`);

/** A step as a build unit: the same shape, so it goes through the same freshness check */
const unitFor = (step: ChainStep): BuildUnit => ({
  inputs: step.inputs.map((input) => path.join(REPO_ROOT, input)),
  outputs: (step.outputs ?? []).map((output) => path.join(REPO_ROOT, output)),
  excludes: (step.excludes ?? []).map((excluded) => path.join(REPO_ROOT, excluded)),
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
  const record = stampRecord(stampFor(step.name));
  // `recorded: false` is required of the types and unreachable from here, which is worth saying rather than
  // leaving as a fallback someone trusts: this is asked only of a step that *passed* in this run, and a step
  // that passed rewrote its own stamp a moment ago with both fields in it. The state it stands for — a stamp
  // from before they were recorded — is reachable only by whoever asks about a run they did not just watch,
  // which is `--dry`, the question "why would this run?". That is where naming the files would pay next, and it
  // would make this branch live.
  if (record?.files === undefined || record.declared === undefined) return { ...nothing, recorded: false };
  const changes = asking.changedInputs(unitFor(step), { files: record.files, declared: record.declared });
  const at = (file: string) => {
    try {
      return fs.statSync(path.join(REPO_ROOT, file)).mtimeMs;
    } catch {
      return undefined; // gone between the diff and this stat, which the diff already called removed
    }
  };
  const asOf = (field: unknown) => (typeof field === 'string' ? Date.parse(field) : undefined);
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
  return { gained: changes.gained, lost: changes.lost, files, identical, recorded: true };
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
  if (step.cache === false) return run(step.name, step.seconds, force);
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
 * the tier budgets, 15s and 60s, and the third lane became both faster and green.
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
  let cached = 0;

  // Derived from each step's `needs`, and validated first: an unknown dependency or a cycle fails here rather
  // than halfway through a six-minute run
  const steps = orderedSteps();
  const lanes = laneCount();

  /** Its verdict, asked at dispatch — see `dispatch` for why that timing is load-bearing */
  /**
   * Why a step would run. `asking` is how it reads the tree: the default reads per step, and a sweep reads once
   * for all of them.
   *
   * **Which one is not a performance choice.** A sweep answers as of its first read, so it is right only where
   * every step is asked about at one moment — `--dry`, which runs nothing, and the report below, which runs after
   * everything has stopped. The dispatch decisions are asked as the scheduler reaches each step, spread across the
   * whole run, so they read for themselves: a step reached at t=100s has to see the tree as of then, or a snapshot
   * from t=0 calls it fresh when another step has just written into its inputs. That is the defect the report
   * exists to find, and sharing reads there would hide it instead.
   */
  const staleReason = (step: ChainStep, asking = { staleReason: unitStaleReason }): string | null =>
    step.cache === false
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
      const record = stampRecord(stampFor(step.name));
      if (record?.files === undefined || record.declared === undefined) return 'its last run recorded no per-file digests';
      return firstChange(sweep.changedInputs(unitFor(step), { files: record.files, declared: record.declared }));
    };
    for (const step of steps) {
      // `--all` runs everything, so a dry run given `--all` must say so rather than reporting the cache it
      // would ignore. A plan that does not answer for the flags it was given is worse than no plan.
      const why = staleReason(step, sweep);
      const willRun = all || why !== null;
      // Naming what moved in place of the sentence, which was the same for every stale step and said less
      const moved = !all && why === INPUTS_CHANGED ? whatChanged(step) : '';
      const reason = all ? '--all' : (moved === '' ? (why ?? '') : moved);
      console.log(`${(willRun ? 'run' : 'cached').padStart(7)} t${step.tier} ${step.name.padEnd(STEP_NAME_WIDTH)} ${wrapAt(DRY_REASON_COLUMN, reason)}`.trimEnd());
    }
    return;
  }

  /** The reason a step ran, kept for its line and for the failure report */
  const reasons = new Map<string, string>();
  const outcome = await schedule({
    steps,
    lanes,
    skip: (step) => {
      const why = staleReason(step);
      if (!all && step.cache !== false && why === null) {
        cached++;
        // On its own line where it was skipped, and dimmed. The order these arrive in is information — it is
        // when the scheduler reached the step — so they are not collected and printed together at the end;
        // the weight is what separates them from the rows that did work, not the position.
        console.log(dim(`${'cached'.padStart(7)} t${step.tier} ${step.name}`));
        return true;
      }
      reasons.set(step.name, all ? '--all' : (why ?? ''));
      return false;
    },
    run: async (step) => {
      const result = await runAndStamp(step, all);
      results.push(result);
      // TIMEOUT is its own verdict: a step that ran out of budget failed for a different reason than one
      // that returned non-zero, and which it was is the first thing you need to know.
      const verdict = result.code === 0 ? 'ok' : result.timedOut ? 'TIMEOUT' : 'FAIL';
      console.log(`${verdict.padStart(7)} t${step.tier} ${step.name.padEnd(STEP_NAME_WIDTH)} ${secs(result.ms).padStart(6)}  ${wrapAt(REASON_COLUMN, briefly(reasons.get(step.name) ?? '', declaredIn(step.name)))}`.trimEnd());
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
    console.log(`${'ERROR'.padStart(7)} t${steps.find((s) => s.name === step)?.tier ?? '?'} ${step.padEnd(STEP_NAME_WIDTH)} ${' '.repeat(6)}  the chain could not run it`);
    console.log(`\n${'='.repeat(72)}\n${step}: the runner threw, which is a bug in the chain rather than a failing check\n${'='.repeat(72)}\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  }

  const failed = outcome.failed === undefined ? undefined : results.find((r) => r.step === outcome.failed);
  if (failed) {
    const step = steps.find((s) => s.name === failed.step)!;
    const why = failed.timedOut
      ? `${step.name} timed out: it exceeded its ${secs(budgetFor(step.seconds ?? 300))} budget and its process group was killed. It costs ${step.seconds ?? '?'}s healthy, so either it is wedged or it has grown and the measurement in chain-steps.ts is stale.`
      : `${step.name} failed (exit ${failed.code})${howLong(step, failed.ms, lanes)}`;
    console.log(`\n${'='.repeat(72)}\n${why}\n${'='.repeat(72)}\n${failed.output}`);
  }

  // Where the time goes by tier, which is the number the goal's phases move. Its own line under the verdict:
  // it is a breakdown rather than part of the sentence, and in the sentence it competed with the two numbers
  // a run is read for — what it cost and how much of it was skipped.
  const byTier = ([1, 2, 3] as Tier[]).map((t) => {
    const ms = CHAIN_STEPS.filter((s) => s.tier === t)
      .reduce((sum, s) => sum + (results.find((r) => r.step === s.name)?.ms ?? 0), 0);
    return `t${t}= ${secs(ms)}`;
  }).join('  ');

  const skipped = cached ? ` (${cached} of ${steps.length} cached)` : '';
  // Measured, not declared. Reporting the floor from `seconds` made it wrong by the amount the table had
  // drifted — 109s against the 125.8s those same four steps actually took in that run.
  const measuredMs = new Map(results.map((r) => [r.step, r.ms]));
  const ran = steps.filter((step) => measuredMs.has(step.name))
    .map((step) => ({ ...step, seconds: Math.round((measuredMs.get(step.name) ?? 0) / 1000) }));
  const path = criticalPath(ran);
  const floor = lanes > 1 && path.names.length > 1 ? `\ncritical path ${path.seconds}s (${path.names.join(' -> ')})` : '';
  const verdict = failed ? `chain FAILED at ${failed.step}` : outcome.failed ? `chain FAILED at ${outcome.failed}` : 'chain passed';
  // Something writing into a step's inputs after it ran is why a "15 of 17 cached" chain still paid 34s
  // for a typecheck every time. Asked here, where the answer is one hash per step and already to hand.
  //
  // Every step is asked about at this one moment, with nothing left running, so one reading of the tree answers
  // both halves: whether each step is stale, and which of its inputs moved. A fresh sweep, never the dry one.
  const sweep = freshnessSweep();
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

  console.log(`\n${verdict} in ${secs(Date.now() - started)}${skipped}${lanes > 1 ? ` with ${lanes} lanes` : ''}\n${byTier}${floor}`);
  // Not process.exit(): it drops whatever stdout has still to flush, and the failing step's captured output
  // printed just above is the one thing here worth reading. Measured: piped, process.exit() delivers 64KB
  // of a 500KB write, and @app/default-setup's suite output alone is 654KB.
  process.exitCode = outcome.failed ? 1 : 0;
}

// A throw here is a bug in the chain, not a failing check, and the two must not look alike
try {
  await main();
} catch (err) {
  console.error(`\nthe chain itself failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exitCode = 1;
}
