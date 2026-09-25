/**
 * Spawning with a wall-clock budget, because a run that can hang cannot fail.
 *
 * Every orchestrator here — the chain, the unit runner — used to spawn with no bound, so one wedged step
 * hung the whole run until a person noticed and killed it by pid. The failures that produced that were not
 * exotic: a test server that never returned, a build lock waited on for ten minutes, a compile that stopped
 * making progress. None of them could be caught by vitest's own timeouts, because those bound a *test* and
 * not the process around it, and a synchronous block (`Atomics.wait`) is invisible to them entirely.
 *
 * Two rules this enforces, and both matter:
 *
 * - **A budget is sized from a measurement, not chosen heroically.** A bound longer than anyone will wait is
 *   the same as no bound. Callers pass what the step actually costs; this multiplies it.
 * - **The process group dies, not just the child.** `npm run x` is a shell that spawns node that spawns
 *   vitest that spawns workers. Killing the child orphans the rest, which is how this repo ended up with a
 *   `generate-entries` at 99% CPU for a day and a half.
 */
import { spawn } from 'node:child_process';

export interface BoundedResult {
  readonly code: number;
  readonly output: string;
  readonly ms: number;
  /** Set when the budget ran out: what it was doing, for a message that names the cause */
  readonly timedOut?: true;
}

/** A budget from what the step costs when healthy. Four times, floored, so normal variance never trips it. */
export const budgetFor = (measuredSeconds: number): number => Math.max(60_000, Math.round(measuredSeconds * 4) * 1000);

/** How long a killed group gets to exit on SIGTERM before SIGKILL */
const GRACE_MS = 5_000;

export function boundedSpawn(command: string, args: readonly string[], budgetMs: number, cwd = process.cwd()): Promise<BoundedResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    // Its own process group, so one kill reaches the whole tree rather than orphaning it
    const child = spawn(command, [...args], { cwd, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let timedOut: true | undefined;
    child.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { output += d.toString(); });

    const killGroup = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      // Negative pid is the group. It throws once the group is gone, which is the normal case on the
      // SIGKILL that follows, so a failure here is nothing to report.
      try { process.kill(-child.pid, signal); } catch { /* already gone */ }
    };

    const budget = setTimeout(() => {
      timedOut = true;
      killGroup('SIGTERM');
      setTimeout(() => killGroup('SIGKILL'), GRACE_MS).unref();
    }, budgetMs);
    budget.unref();

    child.on('close', (code) => {
      clearTimeout(budget);
      resolve({ code: timedOut ? 124 : code ?? 1, output, ms: Date.now() - started, ...(timedOut ? { timedOut } : {}) });
    });
  });
}
