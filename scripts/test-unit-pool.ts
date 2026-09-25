/**
 * One pool's unit tests, running only the projects whose inputs changed.
 *
 *     tsx scripts/test-unit-pool.ts host   # the root vitest.config.ts projects, under @abuddy/source
 *     tsx scripts/test-unit-pool.ts pack   # each pack suite, resolving the published dist
 *
 * The chain has one step per pool rather than one per suite, because eight steps meant eight vitest
 * processes — two schedulers with no shared budget, which is what pooling removed. What eight steps were
 * actually buying was the per-package *cache key*, and that is separable from the per-package *process*:
 * the step's inputs are the union across the pool, so a warm chain caches the whole step, and when it does
 * run this asks `poolUnitFor` per project and passes `--project` for only the stale ones.
 *
 * **This is the inner half of two caches over one body of work**, and the rule that keeps such a pair honest
 * is that the inner layer's inputs cover the outer's. Both derive from `suiteInputs`, so they do. When they
 * did not, the four files the step declared and no project did — this one among them — made the step stale,
 * and it ran, found every project fresh and returned green having tested nothing. `--all` reaches here for
 * the same reason: the chain overriding its own stamps says nothing to a cache it does not know about, so
 * the step declares `forceArgs` and the flag arrives on argv.
 *
 * Stamps are per project through `stampedRunAll`, which takes every fingerprint in a run before it starts
 * and writes each only where it passed — one protocol, the same one the package builds and the chain use.
 */
import { execFileSync } from 'node:child_process';
import { stampedRunAll, unitStaleReason } from '@abuddy/host/build/packages-built';
import { UNIT_SUITES } from './lib/unit-suites.ts';
import { POOL_SECONDS } from './lib/chain-steps.ts';
import { poolStampFor, poolUnitFor } from './lib/unit-pool.ts';
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
