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
import * as fs from 'node:fs';
import type { Page } from '@playwright/test';
import { DRIVE_REF, createSession, type SessionPage } from './session.ts';
import { ENGINE_TOKEN_HEADER, isPixels, startEngineServer, type ExtraVerbs } from './server.ts';
import { engineRecipe, publishEngineMarker, removeEngineMarker } from './marker.ts';
import { connectApiClient } from './api-client.ts';

/** The `AppHelper` members the engine serves, taken whole rather than one callback at a time */
export type EngineAppHelper = {
  readonly screenshot: (name: string) => Promise<unknown>;
  readonly waitForState: (check: string, timeoutMs?: number) => Promise<unknown>;
  readonly waitForPlugin: (pluginId: string, timeoutMs?: number) => Promise<unknown>;
};

/**
 * The real window, for a session someone is looking at.
 *
 * One method, because one act needs it: a viewport Playwright sets is emulated *inside* the window, so in
 * a shown run it letterboxes the app against the desktop. Given this port, `/set-viewport` moves the
 * window itself and what the agent sees is what a user would; given none, it sets the emulated viewport,
 * which is what keeps a suite's layout deterministic. `src/launch-env.ts`'s `pinsViewport` is the one
 * decision of which run is which, and `driveEngineBody` is where it is read.
 */
export type EngineWindow = {
  /** Resizes the window and answers with the size it actually took, which need not be the one asked for */
  readonly setContentSize: (width: number, height: number) => Promise<{ width: number; height: number }>;
};

export interface DriveEngineOptions {
  /** The page the fixture opened */
  readonly page: Page;
  /** The app's own log file, which `/logs` reads */
  readonly logPath: string;
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
  /**
   * Verbs of this app's own, merged over the core table.
   *
   * The core table is what is true of any AgentBuddy app. A verb built out of one app's nouns is the
   * caller's, which is why the scaffolded session file is the place to write one — it is a file its owner
   * keeps, where this package's is not.
   */
  readonly verbs?: ExtraVerbs;
  /** The real window, where one is shown; absent for a run nobody is watching — see `EngineWindow` */
  readonly window?: EngineWindow;
  /**
   * The size to open at, so a session that always wants one says so once instead of posting
   * `/set-viewport` as its first call. Applied through the same port that verb uses, so it moves the
   * window where one is shown and sets the emulated viewport where none is.
   */
  readonly viewport?: { readonly width: number; readonly height: number };
}

/**
 * Reloads the window and returns when the app is usable again.
 *
 * **Playwright's own reload, never `location.reload()` from inside the page.** The app blocks
 * renderer-initiated navigation (`BlockNotAllowdOrigins`, `packages/main`), so that call returns having
 * done nothing — which reads exactly like a reload that changed nothing.
 *
 * **Then onboarding, which is the part that is easy to miss.** The fixture dismisses it once, while the app
 * launches, so a reloaded window comes back sitting in `onboarding` and never reaches `running.connected`.
 * Waiting for that state alone hangs until its deadline and reports a reload that in fact worked.
 *
 * The deadlines only run when the app does not come back; a reload that works answers as soon as it has.
 */
/** The app's state value as the window exposes it, which is all these waits read */
type AppWindow = {
  applicationState?: { getSnapshot(): { value?: Record<string, unknown> | string } };
  __disableOnboardingUI?: () => void;
};

async function reloadWindow(page: Page): Promise<void> {
  await page.reload();
  await page.waitForFunction(() => {
    const app = window as unknown as AppWindow;
    const value = app.applicationState?.getSnapshot().value;
    if (typeof value !== 'object' || value === null) return false;
    // The fixture dismisses onboarding once, as the app launches, so a reloaded window comes back sitting
    // in it. Dismissed from inside the poll because it can arrive at any point during the boot
    if ('onboarding' in value) app.__disableOnboardingUI?.();
    return value.running === 'connected';
  }, null, { timeout: 60_000 });
}

/**
 * Adapts a Playwright page to `SessionPage`. The two evaluation forms stay separate here because they are
 * separate in the port, for the reason `session.ts` gives there.
 */
export const asSessionPage = (page: Page, app: EngineAppHelper, window?: EngineWindow): SessionPage => ({
  evaluateExpression: (source) => page.evaluate(source),
  // Playwright's argument type is `Unboxed<A>`, which unwraps a `JSHandle` into what it points at. The
  // engine never passes one — every argument here is a plain JSON value from a request body — so the two
  // are the same type at every call, and the cast is where that is stated rather than inferred
  evaluateWith: (fn, arg) =>
    page.evaluate(fn as (value: unknown) => unknown, arg as unknown),
  exposeFunction: (name, callback) => page.exposeFunction(name, callback),
  reload: () => reloadWindow(page),
  click: (selector) => page.click(selector),
  fill: (selector, text) => page.fill(selector, text),
  press: (key, selector) => (selector === undefined ? page.keyboard.press(key) : page.press(selector, key)),
  ariaSnapshot: () => page.locator('body').ariaSnapshot(),
  setViewport: async (width, height) => {
    // An emulated viewport is applied exactly, and `setViewportSize` resolves once it has been; a real
    // window clamps, so only it can say what the answer is
    if (window === undefined) {
      await page.setViewportSize({ width, height });
      return { width, height };
    }
    return window.setContentSize(width, height);
  },
  screenshot: (name) => app.screenshot(name),
  waitForState: (check, timeoutMs) => app.waitForState(check, timeoutMs),
  waitForPlugin: (pluginId, timeoutMs) => app.waitForPlugin(pluginId, timeoutMs),
});

/**
 * Where the API is, asked of the app window rather than read off disk.
 *
 * The port file would do, but the **token file is not always written**: `publishApiFiles` skips it unless
 * `NODE_ENV` is development or the API invented its own token, and a packaged app satisfies neither. So reading
 * from disk would work in a checkout and fail against `abuddy drive --app beta`, which is the worst split to
 * ship. The window has both from the preload, which is also how `tests/e2e/app-integration/api-access.spec.ts`
 * gets them.
 */
async function apiAddressFromWindow(page: SessionPage): Promise<{ port: number; token: string }> {
  const found = await page.evaluateExpression(
    '(() => { const api = window.electronAPI; return { port: api?.apiPort, token: api?.apiToken }; })()',
  ) as { port?: number; token?: string };
  if (typeof found?.port !== 'number' || !found.token) {
    throw new Error(
      "The app window didn't offer the API's port and token (window.electronAPI), so the drive session has no way "
      + 'to reach the bus. That bridge is the preload\'s (packages/preload), and without it only the page verbs '
      + '(/eval, /state, /wait, /navigate, /screenshot) could work.',
    );
  }
  return { port: found.port, token: found.token };
}

/**
 * The size a session was told to open at, refused rather than passed on.
 *
 * Checked at all because `drive/` is outside every tsconfig in this repo — `typecheck:scripts` covers
 * `scripts/`, `tests/`, repo-checks and publish-checks — so a session file's option is checked by whatever
 * editor is open on it and by nothing in the chain. `isPixels` is the wire's own rule, shared so a size the
 * `/set-viewport` verb would refuse is not one the session may be started with.
 */
export const checkedViewport = (viewport: { width: number; height: number }): { width: number; height: number } => {
  if (!isPixels(viewport.width) || !isPixels(viewport.height)) {
    throw new Error("The drive session's viewport must be whole numbers of pixels above zero, not "
      + `${JSON.stringify(viewport)}.`);
  }
  return viewport;
};

/**
 * Runs the engine until something ends the session, then cleans up and returns.
 *
 * Renderer errors are collected here rather than drained from the fixture's own array, deliberately:
 * the fixture's copy is what `describeFailure` quotes if the session fails, and draining it would take
 * those errors out of that report. Two listeners cost nothing and leave the fixture untouched.
 */
export async function runDriveEngine(options: DriveEngineOptions): Promise<void> {
  const { page, app, outputDir, logPath, log = (line: string) => console.log(line) } = options;

  const errors: string[] = [];
  const onPageError = (error: Error): void => { errors.push(`pageerror: ${error.message}`); };
  const onConsole = (message: { type: () => string; text: () => string }): void => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);

  let end = (): void => {};
  const ended = new Promise<void>((resolve) => { end = resolve; });

  const sessionPage = asSessionPage(page, app, options.window);
  // Before the address is read and before anything is served, so the first verb to arrive already sees
  // the size the session asked for and nothing has to be re-measured after a resize
  if (options.viewport !== undefined) {
    const { width, height } = checkedViewport(options.viewport);
    await sessionPage.setViewport(width, height);
  }

  /**
   * The session's own connection, opened before the server listens so a verb can never arrive without one.
   *
   * It subscribes inside `connectApiClient` and then claims, in that order: a reply addressed here before
   * anything is listening would be delivered and dropped. The claim's *lifetime* needs no such care — the API
   * releases it when this connection ends, whatever ends it.
   */
  const api = await connectApiClient(await apiAddressFromWindow(sessionPage));
  await api.claim(DRIVE_REF);

  const session = createSession({
    page: sessionPage,
    api,
    takeErrors: () => errors.splice(0, errors.length),
    // Read per call, not held: the app writes to it for as long as the session is up
    readLog: () => (fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf-8') : ''),
  });

  // The server ends the session, after `/close` has been answered — see its `CLOSE_PATH`
  const engine = await startEngineServer(session, () => end(), options.verbs);
  const marker = { ...engine.address, pid: process.pid, host: '127.0.0.1' };
  const file = publishEngineMarker(outputDir, marker);
  log(engineRecipe(file, marker, ENGINE_TOKEN_HEADER, engine.verbs));

  /**
   * A signal also ends the session, though it is **not** what makes Ctrl-C safe: Playwright's own interrupt
   * handling tears a session down and already runs fixture teardown, so nothing is orphaned without these.
   * They stay because resolving the body first costs four lines and ends the run as a pass rather than an
   * interruption when they win the race; nothing depends on their winning it.
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
    session.stop();
    await api.close();
  }
}

export { ENGINE_TOKEN_HEADER } from './server.ts';
export { object, optionalMs, optionalText, pixels, present, required, safeName, verb } from './server.ts';
export type { ExtraVerbs, Reader, Verb } from './server.ts';
export { connectApiClient, type ApiAddress, type ApiClient, type BusMessage } from './api-client.ts';
export { MARKER_FILE, type EngineMarker } from './marker.ts';
export type { EngineResult, EngineSession, SessionApi, SessionPage } from './session.ts';
