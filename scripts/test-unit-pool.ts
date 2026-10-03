/**
 * One pool's tests, running only the projects whose inputs changed.
 *
 *     tsx scripts/test-unit-pool.ts host         # the root vitest.config.ts projects, under @abuddy/source
 *     tsx scripts/test-unit-pool.ts pack         # each pack suite, resolving the published dist
 *     tsx scripts/test-unit-pool.ts integration  # the expensive half of every suite that has one
 *
 * What this decides is which projects are stale, how many vitest runs that takes, and when each is stamped.
 * Three things it does not, and does not restate: why the chain has one step per pool (`POOL_STEPS` in
 * `scripts/lib/chain-steps.ts`), what a project's freshness is measured against (`scripts/lib/unit-pool.ts`),
 * and the rule both cache layers hold to (`suiteInputs`, beside the steps).
 *
 * `--all` is read here, from argv, because the chain overriding its own stamps says nothing to a cache it
 * does not know about: the pool steps declare `forceArgs` so the flag arrives.
 */
import { execFileSync } from 'node:child_process';
import { diffableStamp, firstChange, freshnessSweep, stampRecord } from '@abuddy/host/build/packages-built';
import type { UnitSuite } from './lib/unit-suites.ts';
import { POOLS, poolStampFor, poolUnitFor, projectsThatDidNotRun, prunePoolStamps, recordRun, recordsVerdict, whyItRuns, type Pool } from './lib/unit-pool.ts';
import { boundedSpawn } from './lib/bounded-spawn.ts';
import { TIMEOUT_MS } from './lib/step-timeouts.ts';
import { exitOnEpipe } from './lib/exit-on-epipe.ts';

exitOnEpipe();


/** The diff itself, for the one branch of `whyItRuns` that needs it — over the sweep the decision was made on */
/**
 * Which projects will run, and why — asked of all of them at this one moment, over one reading of the tree.
 *
 * A function rather than a block, so the sweep is unreachable the moment it returns. It caches every byte it
 * reads (14.7MB across the host pool's 2,372 distinct input files), and the run it decides on then spawns vitest
 * for as long as the suites take — `freshnessSweep`'s own rule is that a sweep may not outlive the one question
 * it was made for, and holding one across a test run is the worst way to break it.
 *
 * The verdict goes through the same sweep as the explanation. That is not only the double read it saves: a
 * verdict and an explanation taken from two readings can describe two different trees, which is the shape the
 * chain's report had removed from it a week ago.
 */
function decide(suites: readonly UnitSuite[], pool: Pool, all: boolean): Array<{ suite: UnitSuite; why: string }> {
  const sweep = freshnessSweep();
  return suites.flatMap((suite) => {
    const stamp = poolStampFor(suite, POOLS[pool].half);
    const unit = poolUnitFor(suite, pool);
    const read = diffableStamp(stampRecord(stamp));
    if (!all && sweep.staleReason(unit, stamp) === null) return [];
    // The stamp is read once and handed to both halves, rather than fetched again inside the diff
    const moved = () => (read.stamp === undefined ? '' : firstChange(sweep.changedInputs(unit, read.stamp)));
    return [{ suite, why: all ? '--all' : whyItRuns(read, moved) }];
  });
}

async function main(): Promise<void> {
  // Refused rather than defaulted. With two pools a typo ran the host pool, which at least ran something;
  // with three it would report a pool green having run another one's projects, and the stamps would agree.
  const asked = process.argv[2] ?? '';
  if (!(asked in POOLS)) throw new Error(`no pool named '${asked}' — one of ${Object.keys(POOLS).join(', ')}`);
  const kind = asked as Pool;
  // npm `pretest` hooks do not fire under a root run, so the freshness guard the suites share has nothing
  // to rebuild them. Without this, editing anything a published package is built from — this repo's own
  // package.json included — fails a dozen specs at that guard rather than running them, and the pool
  // quietly collects 162 fewer tests. It is a stat and a return when nothing is stale.
  execFileSync('npm', ['run', 'packages:ensure'], { stdio: 'inherit' });
  prunePoolStamps();
  const { half, suites: suitesOf, run } = POOLS[kind];
  const suites = suitesOf();
  const all = process.argv.includes('--all');

  // The sweep lives and dies inside this call, and what comes back is text
  const running = decide(suites, kind, all);
  const stale = running.map(({ suite }) => suite);
  if (stale.length === 0) {
    console.log(`${kind} pool: all ${suites.length} project(s) up to date`);
    return;
  }
  // Why each one runs, not just that it does. A pool exists to run a subset, so every non-empty run makes a
  // claim about which projects moved — and `npm run chain -- --dry` cannot answer it, because it reports on the
  // *step*, a different unit with a different input set. It can say what moved under `test:unit:host` while
  // being unable to say which of the eleven projects inside it that was
  console.log(`${kind} pool: ${stale.length} of ${suites.length} project(s) to run`);
  const width = Math.max(...stale.map((suite) => suite.workspace.length));
  for (const { suite, why } of running) {
    console.log(`  ${suite.workspace.padEnd(width)}  ${why}`);
  }

  // What each run covers is the pool's to say; a suite is stamped only by the run that included it.
  const runs = run(stale);
  // Said out loud, because a run that records nothing looks exactly like one that does until the next run
  // repeats it. `recordsVerdict` has why.
  if (!recordsVerdict()) console.log(`${kind} pool: recording nothing — this is a diagnostic run`);

  for (const { suites: covered, command, args } of runs) {
    // `stampedRunAll`, under `recordRun`, fingerprints every suite this run covers before it starts and writes
    // each stamp only if it returned — so a failure leaves all of them unstamped and none is measured against a
    // tree the run has already begun touching. `recordRun` is what keeps a diagnostic re-run from writing any of
    // them: its verdict is not the chain's to keep, and recording it skipped the step on the next chain.
    await recordRun(
      // The label is what the stamp records as its `workspace`, and it names the half for the same reason the
      // filename does: a person opening the cache directory has to be able to tell two records apart. Nothing
      // reads it — `unitStaleReason` consults the fingerprint and nothing else — so this is a diagnostic, and
      // what keeps the two records *distinct* is the command inside that fingerprint.
      covered.map((suite) => ({ label: `${suite.dir} (${half})`, unit: poolUnitFor(suite, kind), stamp: poolStampFor(suite, half) })),
      async () => {
        // `suite`, the same class the chain gives this pool as a step — a pool fans out across workers, so
        // it is the rung that stretches most on a smaller box. Not `POOL_SECONDS`, which is this machine's
        // measurement and so would be this machine's deadline (`step-timeouts.ts`).
        const { code, output, timedOut } = await boundedSpawn(command, [...args], TIMEOUT_MS.suite);
        process.stdout.write(output);
        if (code !== 0) throw new Error(`${kind} pool ${timedOut ? 'timed out' : `failed (exit ${code})`}`);
        // Only what the run reported may be stamped: a `--project` filter matching nothing is dropped
        // silently while the others run, so exiting 0 is not evidence that every project was covered.
        const absent = projectsThatDidNotRun(covered.map((suite) => suite.workspace), output);
        if (absent.length > 0) {
          throw new Error(`${kind} pool asked vitest for ${covered.length} projects and ${absent.join(', ')} never reported — a --project filter matched nothing, so their names and vitest's project names have diverged`);
        }
      },
    );
  }
}

// A throw here would otherwise surface as an unhandled rejection, printing a stack on top of the suite
// output that is the thing worth reading. `process.exitCode` rather than `process.exit()`, which would
// truncate that output — the rule `orchestrator-exit.spec.ts` holds for every script here that reprints a
// captured buffer.
try {
  await main();
} catch (err) {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
