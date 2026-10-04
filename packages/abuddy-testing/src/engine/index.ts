/**
 * The whole of a live drive session, for a shim that has a page and wants to be driven.
 *
 * `abuddy drive --serve` writes a two-line script that calls this; a pack author can write the same by
 * hand. Everything it needs it already has from the fixture — the app is launched, onboarding bypassed,
 * the viewport pinned and the output captured — so this adds the channel and the waiting, and nothing
 * about launching an app.
 *
 * **It returns when the session ends**, which is the one structural requirement. The fixture's teardown
 * is the code after `await use(...)`: a body that never returns skips `app.close()`, the listener
 * removal and the data-dir policy. So `/close` resolves this, and a signal resolves this, rather than
 * either killing the process where it stands.
 */
import type { Page } from '@playwright/test';
import { createSession, type SessionPage } from './session.ts';
import { ENGINE_TOKEN_HEADER, startEngineServer } from './server.ts';
import { engineRecipe, publishEngineMarker, removeEngineMarker } from './marker.ts';

/** The `AppHelper` members the engine serves, taken whole rather than one callback at a time */
export type EngineAppHelper = {
  readonly screenshot: (name: string) => Promise<unknown>;
  readonly waitForState: (check: string, timeoutMs?: number) => Promise<unknown>;
  readonly waitForPlugin: (pluginId: string, timeoutMs?: number) => Promise<unknown>;
};

export interface DriveEngineOptions {
  /** The page the fixture opened */
  readonly page: Page;
  /**
   * The fixture's `app`, passed whole.
   *
   * It was three separate callbacks, and that was a trap: the session script is written as a **string**
   * by `abuddy drive --serve`, so nothing typechecks it, and adding `/wait` added two options the
   * template did not pass — `page.waitForState is not a function` at runtime, found by driving. Taking
   * `app` means a new verb reaches a live session without the template changing at all.
   */
  readonly app: EngineAppHelper;
  /** Playwright's `outputDir` for this project: where the marker goes, beside the app's log */
  readonly outputDir: string;
  /** Where the recipe is printed; the runner's stdout by default */
  readonly log?: (line: string) => void;
}

/**
 * Adapts a Playwright page to the four methods the session needs.
 *
 * The two evaluation forms stay separate here as they are in the port: Playwright reads a string as an
 * expression and a function as something to serialise, and a string with an argument silently drops the
 * argument. Keeping them apart is what stops that being available at every call site.
 */
export const asSessionPage = (page: Page, app: EngineAppHelper): SessionPage => ({
  evaluateExpression: (source) => page.evaluate(source),
  // Playwright's argument type is `Unboxed<A>`, which unwraps a `JSHandle` into what it points at. The
  // engine never passes one — every argument here is a plain JSON value from a request body — so the two
  // are the same type at every call, and the cast is where that is stated rather than inferred
  evaluateWith: (fn, arg) =>
    page.evaluate(fn as (value: unknown) => unknown, arg as unknown),
  exposeFunction: (name, callback) => page.exposeFunction(name, callback),
  screenshot: (name) => app.screenshot(name),
  waitForState: (check, timeoutMs) => app.waitForState(check, timeoutMs),
  waitForPlugin: (pluginId, timeoutMs) => app.waitForPlugin(pluginId, timeoutMs),
});

/**
 * Runs the engine until something ends the session, then cleans up and returns.
 *
 * Renderer errors are collected here rather than drained from the fixture's own array, deliberately:
 * the fixture's copy is what `describeFailure` quotes if the session fails, and draining it would take
 * those errors out of that report. Two listeners cost nothing and leave the fixture untouched.
 */
export async function runDriveEngine(options: DriveEngineOptions): Promise<void> {
  const { page, app, outputDir, log = (line: string) => console.log(line) } = options;

  const errors: string[] = [];
  const onPageError = (error: Error): void => { errors.push(`pageerror: ${error.message}`); };
  const onConsole = (message: { type: () => string; text: () => string }): void => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);

  let end = (): void => {};
  const ended = new Promise<void>((resolve) => { end = resolve; });

  const session = createSession({
    page: asSessionPage(page, app),
    takeErrors: () => errors.splice(0, errors.length),
  });

  // The server ends the session, after `/close` has been answered — see its `CLOSE_PATH`
  const engine = await startEngineServer(session, () => end());
  const marker = { ...engine.address, pid: process.pid, host: '127.0.0.1' };
  const file = publishEngineMarker(outputDir, marker);
  log(engineRecipe(file, marker, ENGINE_TOKEN_HEADER));

  /**
   * A signal also ends the session — but it is **not** what makes Ctrl-C safe, and the comment here
   * used to claim it was.
   *
   * Measured 2026-10-04: `SIGINT` to `abuddy drive --serve` left no orphan — the app's API process was
   * gone, the fixture's data-dir policy had run and the ephemeral instance was removed — and Playwright
   * reported the session **interrupted** rather than passed. That verdict is the evidence: a body these
   * handlers had resolved would have completed. So Playwright's own interrupt handling is what tears a
   * session down, and it already runs fixture teardown.
   *
   * They stay because resolving the body first costs four lines and ends the run as a pass rather than
   * an interruption where they win the race; nothing depends on their winning it.
   */
  const onSignal = (): void => end();
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    await ended;
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    page.removeListener('pageerror', onPageError);
    page.removeListener('console', onConsole);
    removeEngineMarker(outputDir);
    await engine.close();
  }
}

export { ENGINE_TOKEN_HEADER } from './server.ts';
export { MARKER_FILE, type EngineMarker } from './marker.ts';
export type { EngineResult, EngineSession, SessionPage } from './session.ts';
