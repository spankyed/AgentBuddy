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
import { DRIVE_REF, createSession, type EngineSession, type SessionPage } from './session.ts';
import { appHelper, waitForAppReady } from '../index.ts';
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
 * decision of which run is which. An attached session has no window at all, and takes the emulated one.
 */
export type EngineWindow = {
  /** Resizes the window and answers with the size it actually took, which need not be the one asked for */
  readonly setContentSize: (width: number, height: number) => Promise<{ width: number; height: number }>;
};

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

export async function attachedSession(options: AttachedSessionOptions): Promise<AttachedSession> {
  const { attachToApp } = await import('./cdp-page.ts');
  const { page, detach } = await attachToApp({ debugPort: options.debugPort });
  await waitForAppReady(page);

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`[page error] ${error.stack ?? error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`[console.error] ${message.text()}`);
  });

  const sessionPage = asSessionPage(page, appHelper(page, options.screenshotDir));
  const api = await connectApiClient(await apiAddressFromWindow(sessionPage));
  await api.claim(DRIVE_REF);

  const session = createSession({
    page: sessionPage,
    api,
    takeErrors: () => errors.splice(0, errors.length),
    // Read per call, as the launched session does: the app writes to it for as long as it is up
    readLog: () => (options.logPath !== undefined && fs.existsSync(options.logPath) ? fs.readFileSync(options.logPath, 'utf-8') : ''),
  });

  return {
    session,
    // Lets go without closing: the app was not this connection's to open and is not its to end
    detach: async () => {
      api.close();
      await detach();
    },
  };
}

export interface AttachedSessionOptions {
  /** From the app's session file — the port it published */
  readonly debugPort: number;
  /** Where `/screenshot` writes */
  readonly screenshotDir: string;
  /** The app's log, which `/logs` reads. Absent means `/logs` answers empty rather than guessing */
  readonly logPath?: string;
}

export interface AttachedSession {
  readonly session: EngineSession;
  readonly detach: () => Promise<void>;
}

export { connectApiClient, type ApiAddress, type ApiClient, type BusMessage } from './api-client.ts';
export type { EngineResult, EngineSession, SessionApi, SessionPage } from './session.ts';
