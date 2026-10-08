// The pre-merge chain: every check, in order, with per-step timings.
//
//   npm run chain
//
// It exists for the timings and the failure output, not for speed. Each step's output is buffered and
// printed only if it fails, so a failure is not buried under six passing suites, and the summary says
// where the time went — which otherwise has to be reconstructed from log file mtimes.
//
// HOW MUCH OF THE MACHINE IT TAKES, AND WHY THAT IS A BUDGET
//
// The steps are parallelisable and the hard part was never the ordering: after `packages:ensure` and
// `build`, nothing writes what another step reads, each app launch takes its own port (`getPort` in main's
// `ApiServer`) and its own data dir (`mkdtemp` in `@abuddy/testing`), and `ensurePackagesBuilt` returns
// before taking the build lock when nothing is stale. One step did not admit to its shared state —
// `test:packaged-authoring` runs `npm run packages:build` first (`tests/scripts/test-packaged-authoring.sh`)
// and so rewrites the `dist/` every other step reads — and `ABUDDY_PACKAGES_PREBUILT=1` reports that now
// rather than racing it.
//
// **The constraint is cores.** Measured 2026-09-24 over seven steps, three at a time cut wall time from
// 348s to 168s by doing 268s of work, and a variant that took the whole machine for one step did 567s of
// it: `@abuddy/cli` went from 56s to 118s and began reporting errors it does not report alone. Spending
// the machine is the whole question, and both runs spent more of it than it had.
//
// **So the unit is cores, not steps**, which took two corrections to see. The first premise was "every step
// already uses all the cores"; `typecheck` was sixteen single-threaded compilers chained with `&&`, holding
// one core for half a minute while nine sat idle, and running its legs at once took it from 29.3s to 10.8s.
// Each leg is its own step now. The second was that a count of steps could meter them at all: nineteen
// steps are one `tsc` and two are a nine-worker vitest pool, so one number ran 3 of 10 cores through the
// typecheck phase and 18 workers on 10 through the test phase. A step declares what it takes
// (`core-budget.ts`), the scheduler admits on the sum, and that is a measured 169.4s against 202.8s with
// half the spread — `budgetFrom` below carries the numbers.
//
// What is left is the floor, and it is not a scheduling problem: the critical path is most of the run, so
// the way to a shorter chain is a cheaper step.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { changedInputs, diffableStamp, firstChange, freshnessSweep, INPUTS_CHANGED, PACKAGES_PREBUILT_ENV, REPO_ROOT, stampedRun, stampRecord, unitStaleReason, type BuildUnit } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS, type ChainStep, chainSteps, needsApp, orderedSteps, poolStepName, STEP_TABLES } from './lib/chain-steps.ts';
import { stampFor, STAMP_DIR } from './lib/chain-stamps.ts';
import { CHAIN_FLAGS } from './lib/chain-flags.ts';
import { CHAIN_WAIT_MS, ChainLockHeld, chainInvocation, holdChainLock } from './lib/chain-lock.ts';
import type { ExclusiveLock } from '@abuddy/host/exclusive-lock';
import { TIMEOUT_MS, timedOutBecause, type TimeoutClass } from './lib/step-timeouts.ts';
import { box, isMeasuredMachine, machineText, MEASURED_ON, thisMachine, unmetRecordingConditions } from './lib/core-budget.ts';
import { commandText, rootScripts } from './lib/npm-scripts.ts';
import { asCount, driftVerdict, idleAfterRun, idleNow, movedBeyondBand, parseFlags, RECORD_IDLE_FLOOR, refusesAsBusy, refusesAsContended } from './lib/measure.ts';
import { machineLine, recordMachine, recordSeconds } from './lib/record-seconds.ts';
import { schedule } from './lib/chain-schedule.ts';
import { driftedSteps, measurementsFrom, outgrownRungs, SECONDS_FLOOR, willNotCache } from './lib/step-timing.ts';
import { briefly, classifyLine, criticalPathLine, pathSavingsLine, cores, declaredAt, dim, driftReport, outgrownReport, DRY_REASON_COLUMN, howLong, identicalRewrites, marker, movedWhileItRan, oneLine, REASON_COLUMN, shouldClassify, staleLines, STEP_NAME_WIDTH, TIME_COLUMN, voidedLine, whenChanged, wrapAt, writerOf } from './lib/chain-output.ts';
import { slowestTests } from './lib/slow-tests.ts';
import { CHAIN_RUN_ENV, DIAGNOSTIC_RUN_ENV, measureCommandFor, POOLS, poolDurationLines, type Pool } from './lib/unit-pool.ts';
import { exitOnEpipe } from './lib/exit-on-epipe.ts';

exitOnEpipe();

import { boundedSpawn } from './lib/bounded-spawn.ts';

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
/**
 * A pool step's own ranking, in the step's time column beside its slow tests.
 *
 * Empty for every other step, and for a pool step this run skipped — `poolDurationLines` has why.
 */
const poolLines = (name: string, ms: number): string[] => {
  const pool = (Object.keys(POOLS) as Pool[]).find((kind) => poolStepName(kind) === name);
  if (pool === undefined) return [];
  // When the step started, so records a previous run wrote are left out rather than printed as this one's
  const measured = poolDurationLines(pool, 6, new Date(Date.now() - ms), { wallMs: ms });
  if (measured.length > 0) return measured;
  // **A pool step that ran and measured nothing is the one line that otherwise reads as a mystery**: `ok`
  // in 0.7s with no ranking under it, for a step whose reason says its inputs changed. The step did its
  // job — it asked the pool, and the pool found every project already current against its own records — but
  // nothing on screen said which of those two things happened. The pool says it in output the chain buffers
  // and prints only on failure, so this is where it has to be said.
  return [`${''.padStart(6)}  nothing measured — every project was already fresh`];
};


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
  ...(step.excludeSuffixes === undefined ? {} : { excludeSuffixes: step.excludeSuffixes }),
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
async function run(step: string, timeout: TimeoutClass, force: readonly string[] = [], env: NodeJS.ProcessEnv = process.env): Promise<Result> {
  // `npm test` is the E2E suite and takes no `run`
  const args = step === 'test' ? ['test'] : ['run', step];
  // npm forwards what follows `--` to the script's own command, which is how this chain was given `--all`
  const withForce = force.length === 0 ? args : [...args, '--', ...force];
  // The bound is the step's declared class, so it carries no machine — see `step-timeouts.ts`
  const { code, output, ms, timedOut } = await boundedSpawn('npm', withForce, TIMEOUT_MS[timeout].ms, { env });
  return { step, ms, code, output, timedOut };
}


const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;


/**
 * The environment a step runs in: every step but `packages:ensure` is told the packages are already built.
 *
 * It is, and the graph is why — all 27 others are transitively ordered after it, which `chain-graph.spec.ts`
 * asserts, so none of them can be the process that still has building to do. Under the flag a package found
 * stale is reported (`PackagesWentStale`, naming what moved and what usually moves it) instead of rebuilt,
 * because rebuilding it would race whatever is writing it and fail about the race.
 *
 * `packages:ensure` is excluded because it is that writer: with the flag it would refuse the one job it has.
 */
/**
 * What a step is spawned with. `CHAIN_RUN_ENV` on every one of them, because a step that caches inside
 * itself has to know whose run this is: a pool's per-project stamps record a pass under the chain's
 * concurrency separately from one established alone, and the chain is the only thing that can say which
 * this is. The classification re-run gets it too and records nothing anyway, through `DIAGNOSTIC_RUN_ENV`.
 */
const envFor = (step: ChainStep): NodeJS.ProcessEnv => ({
  ...process.env,
  [CHAIN_RUN_ENV]: '1',
  ...(step.name === 'packages:ensure' ? {} : { [PACKAGES_PREBUILT_ENV]: '1' }),
});


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
  if (step.neverCachedBecause !== undefined) return run(step.name, step.timeout, force, envFor(step));
  let result: Result | undefined;
  try {
    await stampedRun(step.name, unitFor(step), stampFor(step.name), async () => {
      result = await run(step.name, step.timeout, force, envFor(step));
      if (result.code !== 0) throw new StepFailed(result);
    });
  } catch (err) {
    if (!(err instanceof StepFailed)) throw err;
    return err.result;
  }
  return result!;
}


/**
 * How much of the machine a run may take, in cores. The default is what this machine has.
 *
 * **Measured 2026-10-02, `--all` runs interleaved in pairs on an idle 10-core box, three each:**
 *
 *     3 lanes     202.8s  210.7s  176.6s    median 202.8s, spread 34.1s
 *     10 cores    169.4s  178.3s  163.0s    median 169.4s, spread 15.3s
 *
 * The budget won every pair, by a median of 32.4s, and halved the spread — the half the typecheck
 * flattening bought as well (18s to 0.7s there, for a median that did not move). The budgeted run landed
 * 9s off its own measured critical path, so little scheduling slack is left in it.
 *
 * **What a count of steps could not ask.** Nineteen of these steps are one `tsc` and two are a nine-worker
 * vitest pool, so one number metering both ran 3 of 10 cores through the typecheck phase and 18 workers on
 * 10 through the test phase. `--lanes` is gone rather than kept beside this: its one remaining job was
 * `--lanes 1`, and `--cores 1` is already serial, the budget being soft enough to admit the first ready
 * step and nothing beside it.
 *
 * A simulation over the declared `seconds` put the lanes at 201s and the budget at 198s — right about the
 * old default and pessimistic about the new one by 29s, because it charges every step the cost it was
 * measured at under three lanes, which is the contention a budget removes. Worth knowing before trusting
 * the next such simulation in either direction.
 *
 * Defaulting to this machine's cores means a smaller box gets its own budget rather than this one's, and
 * that much is untested: on four cores the two unit pools nearly serialise, and whether that beats the
 * oversubscription a step count produced there has not been measured anywhere.
 *
 * **`--cores N` is a cap on what to spend of *this* box, not a pretend box of N.** Each step's width is
 * resolved against the machine (`coresFor` reads `box()`), so the flag moves the budget and leaves the
 * widths alone. That is what makes `--cores 12` on ten cores a deliberate-oversubscription measurement
 * rather than a simulation of twelve, and `--cores 4` a cap a nine-core pool cannot fit inside, so it runs
 * alone. Resolving the widths against the flag instead was proposed and declined: it would turn the flag
 * into a simulation nothing can validate on the box it runs on, and the oversubscription it permits is
 * already what the soft budget allows a single step. What the divergence does cost is the schedule's
 * identity, which is why `isMeasuredSchedule` asks about both numbers.
 */
const budgetFrom = (cores: string | undefined): number => asCount(cores, 'cores') ?? box();

async function main(): Promise<void> {
  const started = Date.now();
  const results: Result[] = [];
  // One parse for every flag, which is what makes a typo an error: `process.argv.includes` accepted
  // anything and reported nothing, so `--lanez 3` ran a whole chain having ignored what it was told.
  //
  // **The chain takes no positionals, and refusing them catches npm's `--`.** `npm run chain --dry` does
  // not pass `--dry` through — npm keeps it — so that form runs the whole chain, which is what the guide
  // documented in two places. `npm run chain --dry --cores 10` is worse: npm keeps both flags and hands
  // this a bare `10`, and before this clause it ran a full chain over a stray argument in silence.
  const args = parseFlags(process.argv.slice(2), CHAIN_FLAGS);
  if (args.positionals.length > 0) {
    throw new Error(`The chain takes flags only, not ${args.positionals.join(' ')}`
      + ' — npm keeps a flag you did not put after `--`, so write `npm run chain -- --dry`');
  }
  // `--adopt` is what `--record` does on another machine, so on its own it is a flag that would be accepted
  // and then never read — the shape `10e7b9391` removed when `--lanez 3` ran a full chain in silence. Refused
  // here rather than inside `recordTheCosts`, which is reached after the whole chain has run.
  if (args.flags.has('adopt') && !args.flags.has('record')) {
    throw new Error('--adopt only means something with --record: it is how another machine records this table,'
      + ' and it writes MEASURED_ON with the costs. Write `npm run chain -- --all --record --adopt`.');
  }
  const all = args.flags.has('all');
  // What the chain would do, without doing it. The answer is a pure function of the tree, so it is the way
  // to check the cache on a machine too loaded to time a run on — and the way to find out why a step you
  // expected to be cached is not. It reports each step against the tree as it stands, so the verdicts after
  // the first step that would run are what that step would produce nothing for: a plan, not a prediction.
  const dry = args.flags.has('dry');
  // The retry costs the failing step's own time before the verdict appears, and most failures are the ordinary
  // kind where the reader already knows what they broke
  const noClassify = args.flags.has('no-classify');
  // The E2E suite is a harness for driving the app rather than a gate, so it runs when asked for
  const e2e = args.flags.has('e2e');
  // A step whose inputs moved while it ran verified nothing, which is always reported; this decides whether
  // the chain fails on it. Opt-in because the honest answer can be a long list — `api:check` rebuilding
  // `@abuddy/testing` mid-chain once left twenty passed steps stale, every one of them correctly named
  const strict = args.flags.has('strict');
  let cached = 0;

  // Derived from each step's `needs`, and validated first: an unknown dependency or a cycle fails here rather
  // than halfway through a six-minute run
  const steps = orderedSteps(chainSteps(e2e ? ['test'] : []));
  const budget = budgetFrom(args.values.cores);

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
    // What the run would admit on, which is the half of the plan the per-step lines cannot carry. Only the
    // steps above one core are listed: the rest are a count, because nineteen lines reading `1` is the table
    // `POOL_WIDTH` deliberately does not keep.
    const wide = steps.filter((step) => step.cores > 1);
    console.log(`\nadmitting on ${cores(budget)}, ${box()} cores on this machine:`);
    for (const step of wide) console.log(`${String(step.cores).padStart(7)} ${step.name}`);
    console.log(`${'1'.padStart(7)} each of the other ${steps.length - wide.length} steps\n`);
    /**
     * The steps this plan would actually run, which is what its critical path is over.
     *
     * Typed from `steps` rather than as `ChainStep`: `orderedSteps` is what resolves each step's edges, and
     * `criticalPath` needs them — the raw table has no `dependsOn` field, only the function that derives one.
     */
    const planned: (typeof steps)[number][] = [];
    for (const step of steps) {
      // `--all` runs everything, so a dry run given `--all` must say so rather than reporting the cache it
      // would ignore. A plan that does not answer for the flags it was given is worse than no plan.
      const why = staleReason(step, sweep);
      const willRun = all || why !== null;
      if (willRun) planned.push(step);
      // Naming what moved in place of the sentence, which was the same for every stale step and said less
      const moved = !all && why === INPUTS_CHANGED ? whatChanged(step) : '';
      const reason = all ? '--all' : (moved === '' ? (why ?? '') : moved);
      console.log(`${(willRun ? 'run' : 'cached').padStart(7)} ${marker(needsApp(step))} ${step.name.padEnd(STEP_NAME_WIDTH)} ${wrapAt(DRY_REASON_COLUMN, reason)}`.trimEnd());
    }
    // What bounds the plan, over the declared table — the question "which step is worth making faster",
    // answered before anyone measures one. A step that is not on this path runs inside the shadow of the
    // ones that are, so its own duration is not a saving. `criticalPathLine` has what that cost to learn.
    const plannedPath = criticalPathLine(planned, 'declared');
    if (plannedPath !== '') console.log(`\n${plannedPath}`);
    // What shortening any of them could buy, which a duration does not say: a step's saving is capped by
    // the second-longest route, so a long step on a dense graph can be worth nothing. `pathSavingsLine`
    // has the three proposals that cost.
    const plannedSavings = pathSavingsLine(planned);
    if (plannedSavings !== '') console.log(`  ${plannedSavings}`);
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
  /**
   * One run per checkout from here on, because everything below writes this checkout's stamps — `pruneStamps`
   * first. Taken after the `--dry` return above, which reads and writes nothing and is documented as the thing
   * to run on a machine too loaded to time a run on, so it must not be blocked by a run in progress.
   *
   * Released on the way out by `exclusive-lock.ts`'s own `exit` and interrupt handlers, so there is no
   * `finally` here for a chain that throws or is Ctrl-C'd.
   */
  let lock: ExclusiveLock;
  try {
    lock = await holdChainLock({
      what: chainInvocation(),
      waitMs: args.flags.has('wait') ? CHAIN_WAIT_MS : 0,
      onWait: (holder) => console.log(`waiting for another chain run to finish:\n  ${holder}`),
    });
  } catch (err) {
    // Printed rather than rethrown: a throw reaches the top-level catch, which says "the chain itself
    // failed", and this is a refusal. Exit 1, because a caller reading 0 would take it for a chain that passed
    if (!(err instanceof ChainLockHeld)) throw err;
    console.error(`\n${err.message}`);
    process.exitCode = 1;
    return;
  }

  const dispatchSweep = freshnessSweep();
  pruneStamps();

  // **Refused before the run, not after it.** `recordTheCosts` asks this at the end, which is where the answer
  // arrives too late: twice on 2026-10-04 a `--all --record` spent 200 seconds and was then told the machine
  // was 69% idle. The deleted `spec-cost:update` asked first — "it refuses to measure below IDLE_FLOOR,
  // before running anything" — and this is the same gate in the same order, now the only one left.
  //
  // The late one stays, and both are needed: a box quiet now can be loaded by the end, and the chain is its own
  // load. This one saves the run when the answer is already no; that one catches a run disturbed while it ran.
  // `npm run check:idle` is the same reading as a command, for asking without starting anything.
  if (args.flags.has('record')) {
    const before = idleNow();
    if (refusesAsBusy({ idle: before, floor: RECORD_IDLE_FLOOR, force: args.flags.has('force') })) {
      console.log(`\n--record refused before running: the machine is ${Math.round(before * 100)}% idle and this `
        + `needs ${Math.round(RECORD_IDLE_FLOOR * 100)}%.`);
      console.log('  Refused now rather than after the run, which is where the same check used to sit. Wait, or'
        + ' pass --force and know the number is forced.');
      return;
    }
  }

  const outcome = await schedule({
    steps,
    budget,
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
      // And the same for whole files, which is the unit a half is decided in. It reads what the run wrote
      // rather than its output: a step's output is buffered and printed only on failure, so until this
      // existed the pool's own ranking reached nobody running `npm run chain` or `npm run test:unit`.
      // Only for a step that *ran* — a cached step's records are older than the step.
      for (const line of poolLines(step.name, result.ms)) {
        console.log(dim(`${' '.repeat(TIME_COLUMN)}${line}`));
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
    // The names, not just whether there were any: `classifyLine` names them rather than calling the whole
    // thing contention, and `shouldClassify` wants only the count
    const beside = [...outcome.peers.get(failed.step) ?? []];
    const classifying = shouldClassify({
      // What the schedule saw, not what the table predicts: `conflictsOf(step).length > 0` stood here and
      // meant "has a mutex partner", which twelve steps do while running beside two dozen others
      ranAlone: beside.length === 0,
      timedOut: failed.timedOut === true,
      optedOut: noClassify,
    });
    const why = failed.timedOut
      ? timedOutBecause({
        what: step.name,
        timeout: step.timeout,
        measuredOn: MEASURED_ON,
        ...step.seconds === undefined ? {} : { seconds: step.seconds },
      })
      : `${step.name} failed (exit ${failed.code})${howLong(step, failed.ms, budget, classifying)}`;
    console.log(`\n${'='.repeat(72)}\n${why}\n${'='.repeat(72)}\n${failed.output}`);
    if (classifying) {
      // `run`, never `runAndStamp`: a step that passes alone has not passed the chain, and stamping it here
      // would let the next run skip the thing that just failed. Nothing else is executing — `schedule` drains
      // before it returns — so this is the step by itself, which is the whole question being asked.
      //
      // Demonstrated rather than assumed, with a `compile` that fails then passes: the retry reports passing,
      // and the next chain still says `compile  no stamp — it has not run yet, or the last run failed`.
      //
      // **Refusing the chain's own stamp is not enough for a step that caches inside itself**, which the three
      // pool steps do. `DIAGNOSTIC_RUN_ENV` is how the refusal reaches them: measured 2026-10-02, a crowded
      // failure of `test:unit:host` was re-run here, the re-run wrote all eleven project stamps, and the next
      // chain ran zero tests and called the step green. `recordsVerdict` (`scripts/lib/unit-pool.ts`) carries
      // the evidence and why a *build* under the same re-run still records.
      const retry = await run(step.name, step.timeout, all ? step.forceArgs ?? [] : [],
        { ...envFor(step), [DIAGNOSTIC_RUN_ENV]: '1' });
      // The verdict reports what the chain cost. The retry is a diagnostic after it, so a 60s re-run must not
      // land on the one number a reader compares between runs.
      classifyMs = retry.ms;
      console.log(classifyLine(retry, MEASURED_ON, beside));
    }
  }

  const skipped = cached ? ` (${cached} of ${steps.length} cached)` : '';
  // Measured, not declared. Reporting the floor from `seconds` made it wrong by the amount the table had
  // drifted — 109s against the 125.8s those same four steps actually took in that run.
  // `measurementsFrom`, not the results: a killed step's elapsed time is its deadline, and every reader below
  // — the floor, the drift report, the rung report, `--record` — would take that for a cost
  const measuredMs = measurementsFrom(results);
  const ran = steps.filter((step) => measuredMs.has(step.name))
    .map((step) => ({ ...step, seconds: Math.round((measuredMs.get(step.name) ?? 0) / 1000) }));
  const measuredPath = criticalPathLine(ran, 'measured');
  const measuredSavings = pathSavingsLine(ran);
  const floor = measuredPath === ''
    ? ''
    : `\n${measuredPath}${measuredSavings === '' ? '' : `\n  ${measuredSavings}`}`;
  // Named rather than folded in, so the verdict's number stays comparable between runs and the wall time still
  // adds up — a reader who times the command should not find seconds the chain does not account for.
  const reran = classifyMs > 0 ? ` (+${secs(classifyMs)} re-run)` : '';
  // `voided` is filled by the stale block below, which runs before this is printed. Kept as a function rather
  // than a const for that reason: the verdict is composed here and the facts it needs arrive after
  const verdictText = (): string => {
    if (failed) return `chain FAILED at ${failed.step}`;
    if (outcome.failed) return `chain FAILED at ${outcome.failed}`;
    // Not "at": nothing failed its own check. A step read a tree that changed under it, so what is wrong is
    // the result rather than the step, and the sentence has to say which
    if (strict && voided.length > 0) return `chain FAILED: ${voided.join(', ')} ran against a tree that moved`;
    return 'chain passed';
  };
  // Something writing into a step's inputs after it ran is why a "15 of 17 cached" chain still paid 34s
  // for a typecheck every time. Asked here, against the sweep taken above.
  /** Steps whose inputs moved *during* the run, so their pass describes a tree that no longer existed */
  const voided: string[] = [];
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
      // Hoisted out of the `staleLines` call it used to sit in, because the verdict needs it too: `when` is the
      // only thing in the system that tells a change *during* the run from one after it, and `willNotCache`
      // cannot see it — it compares fingerprints, which say that something moved and never when
      const moved = whatMoved(step, steps, sweep);
      for (const line of staleLines({ name, nameWidth, reason: unusual, ...moved })) console.log(line);
      if (movedWhileItRan(moved.files)) voided.push(name);
    }
    console.log(dim('  Declare what writes there in that step\'s `outputs`, or stop declaring the tree as an input.'));
    if (voided.length > 0) console.log(voidedLine(voided, strict));
  }

  // The table feeds the kill budget and the floor above, so a number a run has contradicted is worth more
  // than a note in a doc nobody re-reads
  // Every `seconds` is the cost under one admission policy, so a different one invalidates all of them at
  // once — which happened silently the day a third lane landed two hours after a number was taken under two.
  // The policy is now the box, because that is what the default budget is, and that makes a fact explicit
  // that was only ever implicit: these numbers were always measured on one machine and nothing said which.
  if (!isMeasuredMachine(MEASURED_ON)) {
    // Context, and no instruction — this message fires *only* off the reference machine, and it used to end
    // "Re-measure with `npm run chain -- --all --record`", which is refused *only* off the reference
    // machine. The one line that appears there named the one command that cannot work there.
    console.log(`\nchain-steps.ts' seconds were measured on ${machineText(MEASURED_ON)}; this is ${machineText(thisMachine())}.`);
    console.log('  So the report below is context rather than advice: what a step cost here is true, and the');
    console.log('  table it is compared against describes another machine.');
  }

  const report = driftReport(driftedSteps(steps, measuredMs, outcome.peers), budget, MEASURED_ON, all);
  if (report !== '') console.log(report);

  // **The bound asked of the measurement.** `declaredShare` gates on what a step declares, and the band above
  // watches declarations at half-to-double — looser than the bound's own margin for four steps, so a step can
  // outgrow its rung and pass. A run is the one place both numbers exist, which is `criticalPath`'s reason for
  // reading measured seconds too.
  //
  // The schedule goes in because the answer depends on it, not to decide what to print: `declaredShare`
  // projects onto a machine `stretches` times slower, so a reading from a slower box counts the slowdown
  // twice and every number it produces is about a machine nothing sized a rung for. `outgrownRungs` has the
  // measurement. That is the difference from `driftReport` above, which prints its rows anywhere because a
  // cost is true wherever it was taken, and gates only the sentence telling a reader to record it.
  // The command comes from how the step is run rather than from its name, because the three pool steps cache
  // inside themselves and so cannot be measured by their npm script (`measureCommandFor`)
  // `all` goes in so the report can say the reading is an upper bound rather than a comparison; it is the
  // one `RECORDING_CONDITIONS` member this reader skips, and `outgrownRungs` has why
  const outgrown = outgrownReport(outgrownRungs(steps, measuredMs, budget, MEASURED_ON, thisMachine(), all, outcome.peers)
    .map((row) => ({ ...row, measureWith: measureCommandFor(row.name) })));
  if (outgrown !== '') console.log(outgrown);

  if (args.flags.has('record')) {
    recordTheCosts(steps, measuredMs, budget, all, args.flags.has('force'), args.flags.has('adopt'),
      args.flags.has('forget'), args.values.step);
  } else if (args.flags.has('forget') || args.values.step !== undefined) {
    // Both are modifiers on the write, so without `--record` there is no write to modify. Said rather than
    // ignored: `--step` alone passed silently until 2026-10-04, which is a flag accepted and not used — the
    // failure `CHAIN_FLAGS` exists to prevent, reappearing one level in from the parser.
    const named = [args.flags.has('forget') ? '--forget' : '', args.values.step !== undefined ? '--step' : '']
      .filter(Boolean);
    const both = named.length > 1;
    console.log(`\n${named.join(' and ')} ${both ? 'change' : 'changes'} what --record writes, so `
      + `${both ? 'they need' : 'it needs'} --record: on ${both ? 'their' : 'its'} own there is nothing for `
      + `${both ? 'them' : 'it'} to change.`);
  }

  console.log(`\n${verdictText()} in ${secs(Date.now() - started - classifyMs)}${reran}${skipped}${` on ${cores(budget)}`}${floor}`);
  // Not process.exit(): it drops whatever stdout has still to flush, and the failing step's captured output
  // printed just above is the one thing here worth reading. Measured: piped, process.exit() delivers 64KB
  // of a 500KB write, and @app/default-setup's suite output alone is 654KB.
  process.exitCode = outcome.failed || (strict && voided.length > 0) ? 1 : 0;
  // The handlers in `exclusive-lock.ts` would do this on the way out anyway; releasing here frees it for the
  // next run while this one is still printing, which on a piped run is the longest part of its exit
  lock.release();
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
  budget: number, all: boolean, force: boolean, adopt: boolean, forget: boolean, step?: string): void {
  // **`--step` is what bounds a mistake, and it is the guard three detectors could not give.** `--forget`
  // writes every row from one run, so a run that measured the machine writes the machine everywhere — watched
  // below. None of the cheap ways to *detect* such a run works, so the answer is reach: a wrong number
  // confined to the row you named cannot touch the other twenty-eight, and `declaredShare` catches that one.
  //
  // Refused rather than ignored where it names nothing, because narrowing to an empty set would report
  // "nothing recorded" and read as a quiet table — the silent no-op this repo refuses everywhere.
  if (step !== undefined) {
    if (!forget) {
      console.log('\n--step narrows what --forget writes, so it needs --forget: --record on its own already '
        + 'writes only the rows past their band.');
      return;
    }
    if (!steps.some((candidate) => candidate.name === step)) {
      console.log(`\n--step ${step} is no step in this run, so it would record nothing.`);
      return;
    }
  }
  // **One question, two subjects.** `--adopt` is how another machine takes the table over, writing
  // `MEASURED_ON` in the same operation — without it the costs move and the constant does not, which is the
  // state that makes every check scoped on it skip the box whose numbers are in the file. So a plain record
  // asks whether this run is the schedule the *table* describes, and an adopting one asks whether it is a
  // schedule *this machine* can claim. The second used to be a hand-written `budget !== box()` three lines
  // from a comparison against `measuredOn.cores`; it is the same predicate with the other subject.
  const want = adopt ? thisMachine() : MEASURED_ON;
  // **Every condition at once, from the one list that names them** (`RECORDING_CONDITIONS`). These were a
  // bare `if (!all)` here and a `scheduleMismatch` three lines below, so what a recordable run *is* existed
  // in two places and nowhere as a whole — and the two readers of this same table were each skipping a
  // condition without saying so. `--record` needs all three, because it writes: recording any other
  // schedule hands every step a kill deadline sized from a schedule it will not run under, and a gate
  // comparing only the budget passed `--cores 10` on a twenty-core machine.
  //
  // Reported one at a time and in the list's order, which is the reason this is an ordered list rather than
  // a boolean: taking the conjunction apart at this call site is what once put an instruction under a budget
  // mismatch that only a machine mismatch can act on.
  const unmet = unmetRecordingConditions({ budget, measuredOn: want, wholeTable: all });
  if (unmet.includes('wholeTable')) {
    console.log('\n--record needs --all: a cached step reports no time, and recording that would size a budget from it.');
    return;
  }
  const mismatch = unmet[0];
  if (mismatch === 'machine') {
    console.log(`\n--record refused: these costs are the chain's on ${machineText(MEASURED_ON)}; `
      + `this is ${machineText(thisMachine())}.`);
    console.log(`  Pass --adopt to record this machine's instead, which also writes:\n    ${machineLine(thisMachine())}`);
    return;
  }
  // **Reachable on the measuring machine, both ways, which is worth saying because it looks like it is
  // not.** "Not the measured schedule" reads as "another box", but the budget is the other half of the
  // question, so the ten-core machine that owns the table lands here whenever `--cores` disagrees with it.
  // Exercised both ways 2026-10-03, after the predicate took this shape, and neither wrote anything:
  //
  //   --all --record --cores 9           these costs are what <box> costs at a 10-core budget, ran on 9
  //   --all --record --adopt --cores 9   adopting records what <box> costs at a 10-core budget, ran on 9
  //
  // No case, because nothing can import `scripts/chain.ts` — a command is how this one is checked, and the
  // note is the only place a reader can learn it has been. The reason it reaches here is in
  // `scheduleMismatch`, which is where a case *can* reach the decision.
  if (mismatch === 'budget') {
    console.log(`\n--record refused: ${adopt ? 'adopting records' : 'these costs are'} what `
      + `${machineText(want)} costs at ${cores(want.cores)}, and this ran on ${cores(budget)}.`);
    return;
  }
  // **Judged once the box has stopped moving, not the instant the run returned.** That instant is when this
  // run's own residue peaks, and a single reading there cannot tell it from a stranger's load —
  // `idleWhenSettled` has what that cost. The late check itself stays: it is the only thing that sees a run
  // disturbed half way through, which is the case the pre-flight at the top of `record` cannot reach.
  // **The quietest reading over a watched window, not one taken as the run returns.** That instant is when
  // this run's own residue peaks, and a single 250ms sample there answered for the box — `quietestOf` has
  // what that cost and why the max is the statistic. The late check itself stays: it is the only thing that
  // sees a run disturbed half way through, which the pre-flight at the top of `record` cannot reach.
  const { idle, waitedMs } = idleAfterRun();
  console.log(`\nwatched the box for ${(waitedMs / 1000).toFixed(1)}s after the run: quietest ${Math.round(idle * 100)}% idle`);
  if (refusesAsBusy({ idle, floor: RECORD_IDLE_FLOOR, force })) {
    console.log(`--record refused: this needs ${Math.round(RECORD_IDLE_FLOOR * 100)}%, and nothing quieter came up in that window.`);
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
  // `SECONDS_FLOOR`, not a millisecond one: these are seconds, and the floor is what stops the fraction
  // chasing noise on a step that costs less than a second to begin with. Shared with `driftedSteps`, which
  // stays quiet about a drift this would refuse to write
  const moved = (was: number | undefined, now: number): boolean => movedBeyondBand(was, now, SECONDS_FLOOR);

  // **The two gates a sample needs beyond its per-row band, which this record did without until 2026-10-02.**
  // `spec-cost` has had both; the primitives are shared now (`measure.ts`) rather than copied.
  //
  // The body gate is the one this very change would have walked into. Per-row hysteresis cannot see a drift
  // that moves everything at once: a uniform shave sits under `SETTLED_FRACTION` on every row, so a handful
  // re-record, the run reports success, and the table goes on describing the schedule before it. Changing
  // the chain's admission policy is exactly that shape, and `criticalPath` sums these numbers, so the error
  // compounds where it is least visible.
  // The body itself is read where it is reported, below, so that the verdict and its remedy are decided in
  // one place rather than a number travelling the length of the function to be interpreted at the end.
  const comparable = [...measured.keys()].filter((name) => declared.has(name));
  if (refusesAsContended({
    hasPrevious: comparable.length > 0,
    force,
    moved: comparable.filter((name) => moved(declared.get(name), measured.get(name)!)).length,
    comparable: comparable.length,
  })) {
    console.log(`\n--record refused: ${comparable.filter((name) => moved(declared.get(name), measured.get(name)!)).length}`
      + ` of ${comparable.length} steps moved past their band, which is more than a measurement should.`);
    console.log('  That is a loaded machine or a real regression. Wait, or pass --force if the chain really changed this much.');
    return;
  }

  // **`--forget` changes what is written, never what is refused.** The band keeps a quiet run from rewriting
  // the file on jitter, and it is also why a row 10-20% stale cannot be corrected at all: `max(1s, 35%)` is
  // wider than that, and `--force` overrides the two refusals above rather than this. So the flag drops the
  // band from the *write* while the refusals go on counting rows that crossed it — contention is still
  // contention, which is the separation `spec-cost` drew between its own `--forget` and `--force`.
  //
  // `was !== now` rather than always: `planSecondsEdits` has no no-op filter, so writing unconditionally would
  // splice identical bytes for every unchanged row, report `60s -> 60s` as an edit, and move this file's mtime
  // for nothing — which the freshness sweep reports, on a file five steps read.
  //
  // **Use it when you know what changed, not to chase a drift you do not.** It replaces the whole table from
  // one run, so a run that measured the machine rather than the code writes the machine into every row.
  // Watched 2026-10-04: a `--all --record --forget` on a box 83% idle at the start put `build:app` at 78s
  // against the ~39s six other runs agreed on, `test:integration` at 96s against 60s, and `declaredShare`
  // then failed for two steps. The drift report said so in the same output — "the table moved 24% as a body
  // … re-run on an idle machine until it settles" — and the right response is that advice, a second reading,
  // not this flag again.
  //
  // **Three cheaper guards were tried against those logs and none separates the two cases.** Refusing on a
  // drifted body refuses the one thing the flag is for. Refusing on a wide spread of per-step ratios drowns
  // in steps that barely ran — `packages:ensure` reports 0.3s against a declared 14s on every run. Refusing
  // on any step past `overBand` fires on every run too, quiet ones included, because `check:tiers` declares
  // 0.3s and takes 2-3s. What tells a contended run from a real drift is more than one reading, which is the
  // window `spec-cost.json` has and this table does not.
  // Narrowed here rather than in the writer, which needs no notion of a scope: what it is handed is what it
  // considers, so one filter is the whole of it
  const writing = step === undefined ? measured : new Map([...measured].filter(([name]) => name === step));
  const edits = recordSeconds(writing, declared, forget ? (was, now) => was !== now : moved);
  // Written after the costs and only with them: the table and the box it was measured on are one fact, and
  // the failure this closes is them moving apart. A run that adopts and then records nothing still takes the
  // table over — every row it re-measured agreed, which is a measurement and not an absence of one.
  // Nothing to adopt where this machine already owns the table — and the write is not free to repeat: it
  // puts identical bytes back, which moves `chain-steps.ts`' mtime for no change, and the freshness sweep
  // reports exactly that as a file whose mtime moved while its bytes did not.
  if (adopt && !isMeasuredMachine(MEASURED_ON)) {
    recordMachine(thisMachine());
    console.log(`\nadopted the table: ${machineLine(thisMachine())}`);
  }
  if (edits.length === 0) {
    console.log('\nevery step cost what the table says, within the band — nothing recorded');
    return;
  }
  console.log(`\nrecorded ${edits.length} step cost${edits.length === 1 ? '' : 's'}:`);
  for (const { step, from, to, file } of edits) {
    console.log(`  ${step.padEnd(STEP_NAME_WIDTH)} ${from}s -> ${to}s   ${file}`);
  }
  // Reported after the edits rather than refused, because the rows that cross the band are recorded either
  // way and the body is the thing no row can report. A run that clears a drift is not the run that finds it.
  //
  // Two findings and not one: a movement one step carries is that step's, and `--forget` over the whole
  // table would write this run's machine into twenty-nine rows to fix one. `driftVerdict` asks the question
  // twice; each branch names the operation that fits its answer.
  const verdict = driftVerdict(declared, measured);
  if (verdict.kind === 'body') {
    console.log(`\nthe table moved ${(verdict.share * 100).toFixed(0)}% as a body, which is more than idle runs vary.`);
    console.log('  It survives leaving out the largest mover, so this is the table and not one step.');
    console.log('  A drift that size sits under every per-step band, so no single measurement re-records it.');
    console.log('  Re-run `npm run chain -- --all --record` on an idle machine until it settles.');
  } else if (verdict.kind === 'member') {
    const rest = verdict.without === undefined
      ? 'no other step has a cost to move from'
      : `the rest moved ${(verdict.without * 100).toFixed(0)}%`;
    console.log(`\nthe table moved ${(verdict.share * 100).toFixed(0)}% as a body, and ${verdict.name} is why: without it ${rest}.`);
    console.log(`  So this is one step's cost, not the table's. Record that row alone:`);
    console.log(`    npm run chain -- --all --record --forget --step ${verdict.name}`);
  }
}

// A throw here is a bug in the chain, not a failing check, and the two must not look alike
try {
  await main();
} catch (err) {
  console.error(`\nthe chain itself failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exitCode = 1;
}
