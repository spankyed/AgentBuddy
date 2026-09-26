/**
 * One pool's unit tests, running only the projects whose inputs changed.
 *
 *     tsx scripts/test-unit-pool.ts host   # the root vitest.config.ts projects, under @abuddy/source
 *     tsx scripts/test-unit-pool.ts pack   # each pack suite, resolving the published dist
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
import { stampedRunAll, unitStaleReason } from '@abuddy/host/build/packages-built';
import { UNIT_SUITES } from './lib/unit-suites.ts';
import { POOL_SECONDS } from './lib/chain-steps.ts';
import { poolStampFor, poolUnitFor, projectsThatDidNotRun } from './lib/unit-pool.ts';
import { boundedSpawn, budgetFor } from './lib/bounded-spawn.ts';
import { exitOnEpipe } from './lib/exit-on-epipe.ts';

exitOnEpipe();

async function main(): Promise<void> {
  const kind = process.argv[2] === 'pack' ? 'pack' : 'host';
  // npm `pretest` hooks do not fire under a root run, so the freshness guard the suites share has nothing
  // to rebuild them. Without this, editing anything a published package is built from — this repo's own
  // package.json included — fails a dozen specs at that guard rather than running them, and the pool
  // quietly collects 162 fewer tests. It is a stat and a return when nothing is stale.
  execFileSync('npm', ['run', 'packages:ensure'], { stdio: 'inherit' });
  const suites = UNIT_SUITES.filter((suite) => suite.kind === kind);
  const all = process.argv.includes('--all');

  const stale = suites.filter((suite) => all || unitStaleReason(poolUnitFor(suite), poolStampFor(suite)) !== null);
  if (stale.length === 0) {
    console.log(`${kind} pool: all ${suites.length} project(s) up to date`);
    return;
  }
  console.log(`${kind} pool: ${stale.length} of ${suites.length} project(s) to run — ${stale.map((s) => s.workspace).join(', ')}`);

  // What each run covers. The host suites are projects of one root config, so one vitest run takes them all
  // with `--project`. A pack suite is its own config resolving the published dist, so it cannot share that
  // run — or another pack suite's. One run each, and a suite is stamped only by the run that included it.
  const runs = kind === 'host'
    // with-source supplies the @abuddy/source condition the host suites resolve under
    ? [{ suites: stale, command: 'node', args: ['scripts/with-source.mjs', 'npx', 'vitest', 'run', ...stale.flatMap((suite) => ['--project', suite.workspace])] }]
    : stale.map((suite) => ({ suites: [suite], command: 'npm', args: ['test', '-w', suite.workspace] }));

  for (const { suites: covered, command, args } of runs) {
    // `stampedRunAll` fingerprints every suite this run covers before it starts and writes each stamp only
    // if it returned, so a failure leaves all of them unstamped and none is measured against a tree the run
    // has already begun touching.
    await stampedRunAll(
      covered.map((suite) => ({ label: suite.dir, unit: poolUnitFor(suite), stamp: poolStampFor(suite) })),
      async () => {
        // The budget is what this pool costs healthy, from the same measurement the chain step declares
        const { code, output, timedOut } = await boundedSpawn(command, [...args], budgetFor(POOL_SECONDS[kind]));
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

// probe
