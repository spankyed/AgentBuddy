/**
 * One question, asked of a session started for it and closed afterwards.
 *
 * The expensive part of a drive session is the app launch, and `--serve` already amortises that over many
 * questions. What had no cheap form was the *first* question: it cost an authored `drive/*.ts` script, a
 * launch, and a grep for a prefix the script's author invented. This is the same session, asked once.
 *
 * `launch` is injected because the two callers start an app differently and neither can own the other's
 * recipe — `abuddy drive` builds its environment from `fixtureEnv` and a pack, this repo's
 * `scripts/drive-eval.ts` from its own npm-script environment. What they share is the waiter, the client
 * and the envelope.
 */
import type { ChildProcess } from 'node:child_process';
import { askEngine, CLOSE_PATH, ENGINE_READY, oneShotOutcome, readEngineMarker, type EngineAsk, type EngineMarker, type Outcome } from './drive-engine.ts';

/**
 * How long a session may take to say it is listening.
 *
 * Generous because of what the child does before it answers: `ensureCheckoutPackages`, the fixture's pack
 * build, Electron's launch, then the fixture's own waits — 45s for a main window and 15s for a pack's
 * backend. A bound tighter than those would fire on a cold machine doing exactly the right thing.
 */
export const READY_MS = 180_000;

/** How long the session gets to exit after being told to close, before it is killed */
const EXIT_MS = 30_000;

export interface Launched {
  readonly child: ChildProcess;
  /** Resolves when the process has gone, however it went */
  readonly exited: Promise<{ code: number | null }>;
}

export interface OneShotOptions {
  readonly ask: EngineAsk;
  readonly argument?: string;
  /** Where the session publishes its marker: Playwright's `outputDir` for the engine config */
  readonly resultsDir: string;
  /** The command this caller would name to start a session, which differs by entry point */
  readonly startHint: string;
  /** Starts a session. Omitted by `--attach`, which asks one that is already running */
  readonly launch?: () => Launched;
  /** Where the session's own output goes. Never stdout, which carries the envelope alone */
  readonly log?: (text: string) => void;
}

/** The last lines a child printed, which is all a failure has to go on once stdout is piped away */
function tail(lines: readonly string[], keep = 40): string {
  return lines.slice(-keep).join('\n') || '(nothing)';
}

/**
 * Waits for the session to say it is listening.
 *
 * **Accumulated and split on newlines, not tested per chunk.** A readiness marker can straddle a chunk
 * boundary, and a per-chunk `includes` then never fires — the one-shot hangs to its deadline with no
 * diagnostic. (`packages/main`'s `ProcessManager` is the precedent for the shape and has that bug.)
 *
 * One waiter, three ways out, all settling the same promise: the line, the child exiting first, the bound.
 * The middle one matters most — a session that dies during startup is the common failure, and it reports
 * that rather than timing out on a process already gone.
 */
export function whenReady(child: ChildProcess, log: (text: string) => void, readyMs = READY_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const seen: string[] = [];
    let rest = '';
    let settled = false;
    const settle = (err?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err); else resolve();
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      settle(new Error(`The drive session did not start within ${readyMs / 1000}s. It printed:\n${tail(seen)}`));
    }, readyMs);

    // **Accumulated and split on newlines, not tested per chunk**, which is the whole of the comment above
    // this function. The mirroring to `log` happens here too, so the output a one-shot discards from stdout
    // is not also lost to whoever is watching.
    child.stdout?.on('data', (chunk: Buffer) => {
      log(chunk.toString());
      rest += chunk.toString();
      const lines = rest.split('\n');
      rest = lines.pop() ?? '';
      seen.push(...lines);
      if (seen.some((line) => line.includes(ENGINE_READY))) settle();
    });
    child.once('exit', (code) => settle(new Error(
      `The drive session exited (${code}) before it was listening. It printed:\n${tail(seen)}`,
    )));
    child.once('error', (err) => settle(err));
  });
}

/**
 * Asks one question and hands back the line to print and the code to exit with.
 *
 * **A session this started is always closed, and one it attached to never is.** The first is why the close
 * sits in a `finally`: an orphaned app costs the *next* one-shot, which then fails on Electron's
 * single-instance lock for that data dir. The second is why the close is conditional rather than
 * unconditional — `--attach` is for a session someone else is using, and ending it would be the rudest
 * possible way to answer a question about it.
 *
 * `/close` rather than a signal, because it is the only graceful stop: it resolves the body, which lets
 * `runDriveEngine`'s own teardown remove the marker and close the server, and then the fixture's teardown
 * close the app and apply the data-dir policy. A kill skips all of it.
 */
export async function oneShot(options: OneShotOptions): Promise<Outcome> {
  const { ask, argument, resultsDir, startHint, launch, log = (text) => process.stderr.write(text) } = options;

  if (launch === undefined) {
    const read = readEngineMarker(resultsDir, startHint);
    if ('problem' in read) return oneShotOutcome({ unreachable: read.problem });
    return oneShotOutcome(await askEngine(read.marker, ask, argument));
  }

  const session = launch();
  let marker: EngineMarker | undefined;
  try {
    await whenReady(session.child, log);
    const read = readEngineMarker(resultsDir, startHint);
    if ('problem' in read) return oneShotOutcome({ unreachable: read.problem });
    marker = read.marker;
    return oneShotOutcome(await askEngine(marker, ask, argument));
  } finally {
    // Best effort, and never allowed to throw over the answer the caller already has: a session that has
    // already ended is not a failure, it is the state this was trying to reach
    if (marker !== undefined && session.child.exitCode === null) {
      try {
        await askEngine(marker, { method: 'POST', path: CLOSE_PATH });
      } catch { /* closing an ended session is the outcome, not an error */ }
    }
    if (session.child.exitCode === null) session.child.kill('SIGTERM');
    const killer = setTimeout(() => session.child.kill('SIGKILL'), EXIT_MS);
    try {
      await session.exited;
    } finally {
      clearTimeout(killer);
    }
  }
}
