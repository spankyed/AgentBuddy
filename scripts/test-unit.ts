/**
 * The unit suites, as two pools.
 *
 * It used to run the eight suites as eight `npm test -w` invocations, two at a time. That is two schedulers
 * with no shared budget — this one over suites, vitest's over the files inside each — so a third lane
 * oversubscribed *within* a suite instead of filling idle cores, and the recorded table read
 * 1: 69.8s, 2: 44.3s, 3: 47.7s, 8: 63.1s. Vitest's own sequencer takes every project's files as one list
 * and sorts it longest-first, which is the greedy makespan approximation, so handing it all the files at
 * once is strictly better than handing it one suite at a time.
 *
 * **There are two pools and not one, and the boundary is forced.** Host suites resolve the workspace
 * `@abuddy` packages to source under the `@abuddy/source` condition; the pack suite must resolve the
 * published `dist`, which is the only layout a pack author ever has. Node conditions are per process and
 * vitest shares its worker pool across projects — per-project `poolOptions.execArgv` is ignored, measured —
 * so one process cannot give each kind its own. Probed 2026-09-25: under a pooled process carrying the
 * condition, a `default-setup` spec resolves `@abuddy/sdk` to `src` where it resolves `dist` today. One
 * pool would not have failed; it would have quietly tested something else.
 *
 * `packages:ensure` runs once up front because npm `pretest` hooks do not fire under a root run.
 */
import { execFileSync } from 'node:child_process';
import * as os from 'node:os';
import { boundedSpawn, budgetFor } from './lib/bounded-spawn.ts';
import { UNIT_SUITES } from './lib/unit-suites.ts';
import { exitOnEpipe } from './lib/exit-on-epipe.ts';

exitOnEpipe();

const hostSuites = UNIT_SUITES.filter((suite) => suite.kind === 'host');
const packSuites = UNIT_SUITES.filter((suite) => suite.kind === 'pack');

interface Pool { label: string; command: string; args: string[] }

/**
 * The host pool is the root `vitest.config.ts`, whose `projects` are these same suites; the pack pool is
 * each pack suite's own run. Both are derived from `UNIT_SUITES`, so nothing here lists a package twice.
 */
const POOLS: Pool[] = [
  {
    label: `host pool (${hostSuites.length} suites)`,
    // with-source supplies the @abuddy/source condition the host suites resolve under
    command: 'node',
    args: ['scripts/with-source.mjs', 'npx', 'vitest', 'run'],
  },
  ...packSuites.map((suite) => ({ label: suite.workspace, command: 'npm', args: ['test', '-w', suite.workspace] })),
];

const cpus = os.availableParallelism?.() ?? os.cpus().length;
/**
 * How many pools run at once. **One, measured** on a 10-core machine:
 *
 *     lanes 1: 35.4s, 35.2s wall   35.2s of pool time   passed, passed
 *     lanes 2: 34.3s, 34.4s wall   66.0s of pool time   passed, and one run failed a test
 *
 * A second lane buys about a second, 3%, for 87% more total work and a flake — the host pool alone is
 * 21.1s and 33.6s beside the pack pool. Each pool already spreads itself across the cores, which is the
 * same saturation that capped the old suite-level scheduler at two lanes, arrived at from the other side.
 * `ABUDDY_TEST_LANES=2` is there to re-measure with, not because it is faster.
 */
const lanes = Math.max(1, Number(process.env.ABUDDY_TEST_LANES || 1));

interface Result { pool: string; code: number; ms: number; output: string; timedOut?: true }

async function run(pool: Pool): Promise<Result> {
  // The slowest pool is ~22s alone, so five minutes means wedged rather than slow
  const { code, output, ms, timedOut } = await boundedSpawn(pool.command, pool.args, budgetFor(75));
  return { pool: pool.label, code, ms, output, ...(timedOut ? { timedOut } : {}) };
}

async function main(): Promise<void> {
  console.log(`${POOLS.length} pools over ${UNIT_SUITES.length} suites, ${lanes} at a time (${cpus} cpus)`);
  execFileSync('npm', ['run', 'packages:ensure'], { stdio: 'inherit' });

  const started = Date.now();
  const queue = [...POOLS];
  const results: Result[] = [];
  await Promise.all(Array.from({ length: lanes }, async () => {
    for (let pool = queue.shift(); pool; pool = queue.shift()) {
      const result = await run(pool);
      results.push(result);
      console.log(`  ${(result.code === 0 ? 'ok' : result.timedOut ? 'TIMEOUT' : 'FAIL').padEnd(7)} ${result.pool.padEnd(22)} ${(result.ms / 1000).toFixed(1)}s`);
    }
  }));

  // A lane count that came out wrong once reported "passed" having run nothing, which is worse than a
  // failure: every pool must have reported, or this did not test what it claims to have tested.
  const missing = POOLS.filter((pool) => !results.some((result) => result.pool === pool.label));
  if (missing.length > 0) {
    console.error(`\nran ${results.length} of ${POOLS.length} pools — never ran: ${missing.map((p) => p.label).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const failed = results.filter((result) => result.code !== 0);
  for (const result of failed) console.log(`\n${'='.repeat(70)}\n${result.pool}\n${'='.repeat(70)}\n${result.output}`);
  const total = ((Date.now() - started) / 1000).toFixed(1);
  const work = (results.reduce((sum, result) => sum + result.ms, 0) / 1000).toFixed(1);
  console.log(`\n${failed.length ? `${failed.length} pool(s) failed` : 'unit suites passed'} — ${total}s wall, ${work}s of pool time, ${lanes} lanes`);
  // Not process.exit(): it drops whatever is still in stdout's buffer, and a failing pool's captured output
  // is the one thing here worth reading. Piped, that truncates at 128KB — measured.
  process.exitCode = failed.length ? 1 : 0;
}

void main();
