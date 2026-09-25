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
 * run this asks `suiteInputs` per project and passes `--project` for only the stale ones.
 *
 * Stamps are per project and go through `stampedRun`, so each project's fingerprint is taken before the run
 * and written only where it passed — one protocol, the same one the package builds and the chain use.
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { REPO_ROOT, stampedRun, unitStaleReason, type BuildUnit } from '@abuddy/host/build/packages-built';
import { UNIT_SUITES, type UnitSuite } from './lib/unit-suites.ts';
import { suiteInputs } from './lib/chain-steps.ts';
import { boundedSpawn, budgetFor } from './lib/bounded-spawn.ts';
import { exitOnEpipe } from './lib/exit-on-epipe.ts';

exitOnEpipe();

const STAMP_DIR = path.join(REPO_ROOT, 'node_modules', '.cache', 'abuddy-unit-pool');
const stampFor = (suite: UnitSuite): string => path.join(STAMP_DIR, `${suite.dir}.json`);
const unitFor = (suite: UnitSuite): BuildUnit => ({
  inputs: suiteInputs(suite).map((input) => path.join(REPO_ROOT, input)),
  outputs: [],
});

async function main(): Promise<void> {
  const kind = process.argv[2] === 'pack' ? 'pack' : 'host';
  // npm `pretest` hooks do not fire under a root run, so the freshness guard the suites share has nothing
  // to rebuild them. Without this, editing anything a published package is built from — this repo's own
  // package.json included — fails a dozen specs at that guard rather than running them, and the pool
  // quietly collects 162 fewer tests. It is a stat and a return when nothing is stale.
  execFileSync('npm', ['run', 'packages:ensure'], { stdio: 'inherit' });
  const suites = UNIT_SUITES.filter((suite) => suite.kind === kind);
  const all = process.argv.includes('--all');

  const stale = suites.filter((suite) => all || unitStaleReason(unitFor(suite), stampFor(suite)) !== null);
  if (stale.length === 0) {
    console.log(`${kind} pool: all ${suites.length} project(s) up to date`);
    return;
  }
  console.log(`${kind} pool: ${stale.length} of ${suites.length} project(s) to run — ${stale.map((s) => s.workspace).join(', ')}`);

  // One command for the whole pool, whichever projects are in it
  const [command, args] = kind === 'host'
    // with-source supplies the @abuddy/source condition the host suites resolve under
    ? ['node', ['scripts/with-source.mjs', 'npx', 'vitest', 'run', ...stale.flatMap((suite) => ['--project', suite.workspace])]] as const
    : ['npm', ['test', '-w', stale[0]!.workspace]] as const;

  // Shared, so every project's stamp wraps the same single run: `stampedRun` takes each fingerprint before
  // it starts and writes each stamp only if it returns, so a failure leaves every project unstamped.
  let started: Promise<void> | undefined;
  const runOnce = (): Promise<void> => (started ??= (async () => {
    const { code, output, timedOut } = await boundedSpawn(command, [...args], budgetFor(75));
    if (code !== 0) {
      process.stdout.write(output);
      throw new Error(`${kind} pool ${timedOut ? 'timed out' : `failed (exit ${code})`}`);
    }
    process.stdout.write(output);
  })());

  await Promise.all(stale.map((suite) => stampedRun(suite.dir, unitFor(suite), stampFor(suite), runOnce)));
}

await main();
