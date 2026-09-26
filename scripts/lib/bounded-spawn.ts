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
const GRACE_MS = 2_000;

/**
 * The groups this process started and has not seen close. A budget bounds a step that hangs, but nothing
 * bounded *this* process dying with steps still running: Ctrl-C at a chain, or an orchestrator throwing,
 * left a vitest and its workers alive and reparented to init. That is the same orphan the group-kill above
 * exists to prevent, arriving through the other door.
 *
 * Only pids this module spawned, killed by group — never a search for processes by name.
 */
const liveGroups = new Set<number>();
let reaperInstalled = false;

function reapOnExit(): void {
  if (reaperInstalled) return;
  reaperInstalled = true;
  const reap = (signal: NodeJS.Signals) => {
    for (const pid of liveGroups) {
      try { process.kill(-pid, signal); } catch { /* already gone */ }
    }
  };
  // 'exit' is synchronous-only, which process.kill is. It covers a normal end and an uncaught throw.
  process.on('exit', () => reap('SIGKILL'));
  // A signal does not run 'exit' handlers on its own, so each one reaps and then re-raises the default,
  // which keeps the exit status honest (130 for SIGINT) instead of turning a Ctrl-C into a clean 0.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
      reap('SIGTERM');
      process.removeAllListeners(signal);
      process.kill(process.pid, signal);
    });
  }
}

export interface BoundedOptions {
  readonly cwd?: string;
  /** Inherit stdio instead of capturing it: what a direct run wants, where output is read as it happens */
  readonly stream?: boolean;
}

export function boundedSpawn(command: string, args: readonly string[], budgetMs: number, options: BoundedOptions = {}): Promise<BoundedResult> {
  const { cwd = process.cwd(), stream = false } = options;
  const started = Date.now();
  reapOnExit();
  return new Promise((resolve) => {
    // Its own process group, so one kill reaches the whole tree rather than orphaning it
    const child = spawn(command, [...args], {
      cwd, env: process.env, detached: true,
      stdio: stream ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
    });
    if (child.pid !== undefined) liveGroups.add(child.pid);
    let output = '';
    let timedOut: true | undefined;
    child.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { output += d.toString(); });

    const killGroup = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      // Negative pid is the group. It throws once the group is gone, which is the normal case on the
      // SIGKILL that follows, so a failure here is nothing to report.
      try { process.kill(-child.pid, signal); } catch { /* already gone */ }
    };

    let closed: number | null = null;
    const done = () => resolve({ code: timedOut ? 124 : closed ?? 1, output, ms: Date.now() - started, ...(timedOut ? { timedOut } : {}) });

    const budget = setTimeout(() => {
      timedOut = true;
      killGroup('SIGTERM');
      // Not unref'd, and this is what resolves on the timeout path: an unref'd escalation never fires,
      // because the process ends as soon as the child closes. A child that ignores SIGTERM would then
      // have survived the run that started it, which is the whole failure this exists to prevent.
      setTimeout(() => { killGroup('SIGKILL'); done(); }, GRACE_MS);
    }, budgetMs);
    budget.unref();

    child.on('close', (code) => {
      clearTimeout(budget);
      if (child.pid !== undefined) liveGroups.delete(child.pid);
      closed = code;
      // On a timeout the escalation resolves, so the group is hard-killed before this returns
      if (!timedOut) done();
    });
  });
}
