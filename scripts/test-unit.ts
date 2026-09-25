/**
 * The unit suites, concurrently.
 *
 * Sequentially they are the sum of their parts, and most of them are a few seconds: the wall clock is
 * dominated by whichever one is slowest, so running them together costs about that one suite. They can
 * share a checkout because a reader of the published packages now waits for an in-flight build instead of
 * reporting its half-written stamps as stale (`waitForPackageBuild`, `@abuddy/host/build/packages-built`).
 *
 * Every suite is itself multi-threaded, so this budgets workers rather than spawning eight unbounded
 * vitests: `cpus - 1` workers each would be eight times the cores, and an oversubscribed box runs the same
 * work slower while making birpc timeouts look like test failures. `packages:ensure` runs once up front so
 * the suites' own pretests find nothing to do, rather than eight of them racing to build the same packages.
 */
import { execFileSync, spawn } from 'node:child_process';
import * as os from 'node:os';

// Slowest first: the tail of a concurrent run is whatever started last
const SUITES = ['@app/default-setup', '@abuddy/sdk', '@abuddy/cli', '@abuddy/host', '@app/api', '@abuddy/ears', '@app/renderer', '@app/main'];

const cpus = os.availableParallelism?.() ?? os.cpus().length;
/** Workers per suite; 0 leaves each suite its own default (`cpus - 1`). Measured, see the table below. */
const perSuite = Number(process.env.ABUDDY_TEST_WORKERS || 0);
/**
 * How many suites run at once. Two, measured on a 10-core machine against a one-lane control through this
 * same script — the numbers, wall clock and failures:
 *
 *     lanes  1: 69.8s  0 failed   (the control)
 *     lanes  2: 44.3s  0 failed
 *     lanes  3: 47.7s  1 failed
 *     lanes  8: 63.1s  2 failed
 *
 * Three and eight are not a race: what fails there is `@abuddy/sdk`'s "generated sends compile", which
 * compiles generated code and takes 5.2s against vitest's 5s default, so contention pushes it over. Raising
 * the lane count wants that timeout sized to what the test does first; until then two lanes is the most
 * that is both faster and green. A suite is internally parallel already and uses 2.0-3.8 of the 10 cores,
 * which is why two lanes help at all and why eight only add contention.
 */
const lanes = Math.max(1, Number(process.env.ABUDDY_TEST_LANES || 2));

interface Result { suite: string; code: number; ms: number; output: string }

async function run(suite: string): Promise<Result> {
  const started = Date.now();
  const args = ['test', '-w', suite, ...(perSuite ? ['--', `--maxWorkers=${perSuite}`] : [])];
  const child = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (c: Buffer) => { output += c.toString(); });
  child.stderr.on('data', (c: Buffer) => { output += c.toString(); });
  const code = await new Promise<number>((resolve) => child.on('close', (c) => resolve(c ?? 1)));
  return { suite, code, ms: Date.now() - started, output };
}

async function main(): Promise<void> {
  console.log(`${SUITES.length} unit suites, ${lanes} at a time, ${perSuite ? `${perSuite} workers each` : 'each with its own worker default'} (${cpus} cpus)`);
  execFileSync('npm', ['run', 'packages:ensure'], { stdio: 'inherit' });

  const started = Date.now();
  const queue = [...SUITES];
  const results: Result[] = [];
  await Promise.all(Array.from({ length: lanes }, async () => {
    for (let suite = queue.shift(); suite; suite = queue.shift()) {
      const result = await run(suite);
      results.push(result);
      console.log(`  ${result.code === 0 ? 'ok  ' : 'FAIL'} ${result.suite.padEnd(20)} ${(result.ms / 1000).toFixed(1)}s`);
    }
  }));

  // A lane count that came out wrong once reported "passed" having run nothing, which is worse than a
  // failure: every suite must have reported, or this did not test what it claims to have tested.
  const missing = SUITES.filter((s) => !results.some((r) => r.suite === s));
  if (missing.length) {
    console.error(`\nran ${results.length} of ${SUITES.length} suites — never ran: ${missing.join(', ')}`);
    process.exit(1);
  }

  const failed = results.filter((r) => r.code !== 0);
  for (const f of failed) console.log(`\n${'='.repeat(70)}\n${f.suite}\n${'='.repeat(70)}\n${f.output}`);
  const total = ((Date.now() - started) / 1000).toFixed(1);
  const work = (results.reduce((sum, r) => sum + r.ms, 0) / 1000).toFixed(1);
  console.log(`\n${failed.length ? `${failed.length} suite(s) failed` : 'unit suites passed'} — ${total}s wall, ${work}s of suite time, ${lanes} lanes × ${perSuite} workers`);
  process.exit(failed.length ? 1 : 0);
}

void main();
