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
// The second is the machine. Every step already uses all the cores — vitest runs its files across workers,
// tsc forks per project — so lanes oversubscribe rather than overlap: total work went from 348s to 567s,
// `@abuddy/cli` went from 56s to 118s, and it began reporting errors it does not report alone. Wall time
// fell, but only by doing 60% more work, and failing.
//
// So the constraint is cores, not ordering, and the way to a shorter chain is a cheaper `test:unit` —
// `@abuddy/cli` is over half of it — not a rearranged one. Reopen this on a machine with idle cores, and
// measure rather than trust the arithmetic: max() assumes steps do not slow each other, and here they do.
import * as path from 'node:path';
import { REPO_ROOT, stampedRun, unitStaleReason, type BuildUnit } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS, orderedSteps, type ChainStep, type Tier } from './lib/chain-steps.ts';
import { schedule } from './lib/chain-schedule.ts';
import { criticalPath, driftedSteps } from './lib/step-timing.ts';
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
const stampFor = (step: string): string => path.join(STAMP_DIR, `${step.replace(/[:/]/g, '-')}.json`);

/** A step as a build unit: the same shape, so it goes through the same freshness check */
const unitFor = (step: ChainStep): BuildUnit => ({
  inputs: step.inputs.map((input) => path.join(REPO_ROOT, input)),
  outputs: (step.outputs ?? []).map((output) => path.join(REPO_ROOT, output)),
});

type Result = { step: string; ms: number; code: number; output: string; timedOut?: true };

/** A step, under a budget sized from what it costs healthy. An overrun kills its whole process group. */
async function run(step: string, seconds: number | undefined): Promise<Result> {
  // `npm test` is the E2E suite and takes no `run`
  const args = step === 'test' ? ['test'] : ['run', step];
  // A step with no measurement still gets a bound, just a loose one
  const { code, output, ms, timedOut } = await boundedSpawn('npm', args, budgetFor(seconds ?? 300));
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
async function runAndStamp(step: ChainStep): Promise<Result> {
  if (step.cache === false) return run(step.name, step.seconds);
  let result: Result | undefined;
  try {
    await stampedRun(step.name, unitFor(step), stampFor(step.name), async () => {
      result = await run(step.name, step.seconds);
      if (result.code !== 0) throw new StepFailed(result);
    });
  } catch (err) {
    if (!(err instanceof StepFailed)) throw err;
    return err.result;
  }
  return result!;
}


/**
 * How many steps may run at once. **Two, measured cold on an idle machine (2026-09-25):**
 *
 *     lanes 1   306.9s wall   306.9s of step time   passed
 *     lanes 2   194.0s        339.5s (+11%)         passed, and again at 198.7s and 196.5s, 17 of 17 each
 *     lanes 3   202.7s        477s   (+55%)         one run of two FAILED
 *
 * Three is slower than two *and* not reproducible: the failing run timed out in `findLmdbImports > holds for
 * the repo` at 5220ms against vitest's 5s default, a whole-repo scan that takes ~2s alone. That is the thin
 * margin `scripts/test-unit.ts` already records, where raising one suite's timeout moved the failure to
 * another suite rather than fixing it.
 *
 * Unlimited lanes were measured twice before this and were worse than serial (348s to 567s of work), which
 * is why there is a limit at all rather than a ready queue.
 *
 * **Re-measure this when `test:unit` becomes one root vitest run** (`docs/plans/test-unit-scheduling.md`):
 * two lanes is tuned against eight suite steps, and one step using every core is a different problem.
 */
function laneCount(): number {
  const flag = process.argv.indexOf('--lanes');
  const value = flag === -1 ? 2 : Number(process.argv[flag + 1]);
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
  const staleReason = (step: ChainStep): string | null =>
    step.cache === false
      ? 'never cached: it drives real Electron, and a flaky pass cached green hides an intermittent failure'
      : unitStaleReason(unitFor(step), stampFor(step.name));

  if (dry) {
    for (const step of steps) {
      // `--all` runs everything, so a dry run given `--all` must say so rather than reporting the cache it
      // would ignore. A plan that does not answer for the flags it was given is worse than no plan.
      const why = staleReason(step);
      const willRun = all || why !== null;
      console.log(`${(willRun ? 'run' : 'cached').padStart(7)} t${step.tier} ${step.name.padEnd(26)} ${all ? '--all' : (why ?? '')}`);
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
        console.log(` cached t${step.tier} ${step.name}`);
        return true;
      }
      reasons.set(step.name, all ? '--all' : (why ?? ''));
      return false;
    },
    run: async (step) => {
      const result = await runAndStamp(step);
      results.push(result);
      // TIMEOUT is its own verdict: a step that ran out of budget failed for a different reason than one
      // that returned non-zero, and which it was is the first thing you need to know.
      const verdict = result.code === 0 ? 'ok' : result.timedOut ? 'TIMEOUT' : 'FAIL';
      console.log(`${verdict.padStart(7)} t${step.tier} ${step.name.padEnd(26)} ${secs(result.ms).padStart(6)}  ${reasons.get(step.name) ?? ''}`);
      // So whoever profiles a suite next has its slow tests without instrumenting it
      for (const slow of slowestTests(result.output)) console.log(`${' '.repeat(11)}${secs(slow.ms).padStart(6)}  ${slow.name}`);
      return result.code === 0;
    },
  });

  // A step whose runner threw never produced a Result, so it is reported from the throw itself
  for (const { step, error } of outcome.threw) {
    console.log(`${'ERROR'.padStart(7)} t${steps.find((s) => s.name === step)?.tier ?? '?'} ${step.padEnd(26)}         the chain could not run it`);
    console.log(`\n${'='.repeat(72)}\n${step}: the runner threw, which is a bug in the chain rather than a failing check\n${'='.repeat(72)}\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  }

  const failed = outcome.failed === undefined ? undefined : results.find((r) => r.step === outcome.failed);
  if (failed) {
    const step = steps.find((s) => s.name === failed.step)!;
    const why = failed.timedOut
      ? `${step.name} timed out: it exceeded its ${secs(budgetFor(step.seconds ?? 300))} budget and its process group was killed. It costs ${step.seconds ?? '?'}s healthy, so either it is wedged or it has grown and the measurement in chain-steps.ts is stale.`
      : `${step.name} failed (exit ${failed.code})`;
    console.log(`\n${'='.repeat(72)}\n${why}\n${'='.repeat(72)}\n${failed.output}`);
  }

  // Where the time goes by tier, which is the number the goal's phases move
  const byTier = ([1, 2, 3] as Tier[]).map((t) => {
    const ms = CHAIN_STEPS.filter((s) => s.tier === t)
      .reduce((sum, s) => sum + (results.find((r) => r.step === s.name)?.ms ?? 0), 0);
    return `t${t} ${secs(ms)}`;
  }).join('  ');

  const skipped = cached ? `, ${cached} of ${steps.length} cached` : '';
  // Measured, not declared. Reporting the floor from `seconds` made it wrong by the amount the table had
  // drifted — 109s against the 125.8s those same four steps actually took in that run.
  const measuredMs = new Map(results.map((r) => [r.step, r.ms]));
  const ran = steps.filter((step) => measuredMs.has(step.name))
    .map((step) => ({ ...step, seconds: Math.round((measuredMs.get(step.name) ?? 0) / 1000) }));
  const path = criticalPath(ran);
  const floor = lanes > 1 && path.names.length > 1 ? `, critical path ${path.seconds}s (${path.names.join(' -> ')})` : '';
  const verdict = failed ? `chain FAILED at ${failed.step}` : outcome.failed ? `chain FAILED at ${outcome.failed}` : 'chain passed';
  // The table feeds the kill budget and the floor above, so a number a run has contradicted is worth more
  // than a note in a doc nobody re-reads
  const drifted = driftedSteps(steps, measuredMs);
  if (drifted.length > 0) {
    console.log(`\n${drifted.length} step${drifted.length === 1 ? '' : 's'} cost something other than chain-steps.ts says — re-measure, or record:`);
    for (const { name, declared, measured } of drifted) console.log(`  ${name.padEnd(26)} seconds: ${declared} -> ${measured}`);
  }

  console.log(`\n${verdict} — ${secs(Date.now() - started)}  (${byTier})${skipped}${lanes > 1 ? `, ${lanes} lanes` : ''}${floor}`);
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
