import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boundedSpawn, budgetFor } from '../../../scripts/lib/bounded-spawn.ts';

/**
 * The helper every orchestrator here spawns through, asserted directly for the first time.
 *
 * It had no spec of its own: `chain-graph` checks that the orchestrators *import* it and
 * `orchestrator-exit` that they do not call `process.exit`, both of which are about the callers. What the
 * helper itself promises — that a budget bounds a hang, and that **the process group dies rather than the
 * child alone** — was covered by nothing, and this repo has the scar the group-kill exists for: a
 * `generate-entries` orphaned at 99% CPU for a day and a half.
 *
 * The cases spawn real processes, which is why this is in the expensive half.
 */

const NODE = process.execPath;
/** Short, because two of these wait out the SIGTERM grace period. */
const SHORT_MS = 300;

describe('a bounded spawn', () => {
  it('hands back the code and the output of a command that ends on its own', async () => {
    const result = await boundedSpawn(NODE, ['-e', 'console.log("out"); console.error("err"); process.exit(3)'], 10_000);
    expect(result.code).toBe(3);
    expect(result.output, 'both streams, in one string').toContain('out');
    expect(result.output).toContain('err');
    expect(result.timedOut).toBeUndefined();
  });

  it('gives the child the environment it is handed, not this process\'s', async () => {
    const { output } = await boundedSpawn(NODE, ['-e', 'process.stdout.write(String(process.env.PROBE))'], 10_000,
      { env: { ...process.env, PROBE: 'seen' } });
    expect(output).toBe('seen');
  });

  it('bounds a command that would never end', async () => {
    const result = await boundedSpawn(NODE, ['-e', 'setInterval(() => {}, 1000)'], SHORT_MS);
    expect(result).toMatchObject({ code: 124, timedOut: true });
  });
});

describe('stopping one early', () => {
  it('resolves as aborted rather than as a plain failure', async () => {
    const stop = new AbortController();
    const running = boundedSpawn(NODE, ['-e', 'setInterval(() => {}, 1000)'], 30_000, { signal: stop.signal });
    stop.abort();
    // `code` alone cannot tell a caller this: a killed child closes with a null code, which reads as 1
    expect(await running).toMatchObject({ aborted: true });
  });

  it('does not start one whose signal was already aborted', async () => {
    const marker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bounded-spawn-')), 'ran');
    const result = await boundedSpawn(NODE, ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, '1')`],
      10_000, { signal: AbortSignal.abort() });
    expect(result).toMatchObject({ aborted: true });
    expect(fs.existsSync(marker), 'it should never have run').toBe(false);
  });

  /**
   * The promise the helper is named for, and the one nothing was watching.
   *
   * `npm run x` is a shell that spawns node that spawns vitest that spawns workers; killing the child
   * orphans the rest. So the case spawns a grandchild that outlives its parent shell and asks whether the
   * kill reached it — with the parent already gone, a check on the child alone would pass.
   */
  it('kills the whole group, not the process it started', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bounded-spawn-'));
    const pidFile = path.join(dir, 'grandchild.pid');
    const stop = new AbortController();
    const running = boundedSpawn('sh',
      ['-c', `${NODE} -e 'require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(()=>{},1000)' & wait`],
      30_000, { signal: stop.signal });

    for (let waited = 0; waited < 5000 && !fs.existsSync(pidFile); waited += 50) {
      await new Promise((resolve) => { setTimeout(resolve, 50); });
    }
    const grandchild = Number(fs.readFileSync(pidFile, 'utf-8'));
    expect(grandchild, 'the case cannot prove anything if the grandchild never started').toBeGreaterThan(0);
    expect(() => process.kill(grandchild, 0), 'it is alive before the abort').not.toThrow();

    stop.abort();
    await running;
    expect(() => process.kill(grandchild, 0), 'and gone after it, having been orphaned otherwise').toThrow();
  });
});

describe('the budget a caller passes', () => {
  // A bound longer than anyone will wait is the same as no bound, so it comes from a measurement
  it('is four times what the step costs, with a floor', () => {
    expect(budgetFor(100)).toBe(400_000);
    expect(budgetFor(1), 'nothing is bounded tighter than a minute').toBe(60_000);
  });
});
