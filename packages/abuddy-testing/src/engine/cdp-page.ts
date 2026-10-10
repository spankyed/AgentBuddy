/**
 * Attaching to an app somebody else launched.
 *
 * `_electron` has no `connect`, which is where *"whoever launches owns the page"* came from. But an
 * Electron renderer is Chromium, so `chromium.connectOverCDP` attaches to one that was started with
 * `--remote-debugging-port` and hands back a real `Page` — and every verb is a call on a `Page`, so the
 * same `asSessionPage(page, appHelper(page, dir))` serves a connected page and a launched one with no
 * second implementation. That is the whole of what this module adds: the connect, and finding the window.
 *
 * **What an attached page cannot do is reach the main process.** `electronApp.browserWindow(page)` has no
 * CDP equivalent, so a real window resize is unavailable and `asSessionPage`'s `window` is left out —
 * which it already treats as "nobody is watching" and answers with the emulated viewport.
 *
 * `playwright-core` is imported lazily and is an optional peer: a published CLI must not drag 11MB into an
 * install of someone who only runs `abuddy build`, and nothing but this path needs it.
 */
// **The published types come from `@playwright/test`, not from `playwright-core`.** The runtime import is
// `playwright-core` — that is the package this needs and declares — but typing the exported surface from it
// made tsc write bare `playwright` as the specifier in this package's declarations, which it does not
// depend on and which `published-imports` refuses. One hoisted `playwright-core` is what lets the two be
// the same `Page`, so the public type can be the one the fixture already hands round.
import type { Browser, Page } from '@playwright/test';

/** What the app published, and what this needs to find it */
export interface AttachOptions {
  /** The port the app's `--remote-debugging-port` ended up on, from its session file */
  readonly debugPort: number;
  /** How long to wait for a window with `applicationState` on it (default 15s) */
  readonly timeoutMs?: number;
}

export interface AttachedApp {
  readonly page: Page;
  /**
   * Lets go of the app without closing it — the point of attaching is that it outlives the connection.
   *
   * The `Browser` stays off this surface: nothing outside needs one, since this is what closes it.
   */
  readonly detach: () => Promise<void>;
}

/**
 * Chromium's connect, loaded only when something attaches.
 *
 * It throws with the install rather than failing as a module-not-found from inside a bundle, which is what
 * a missing optional peer otherwise looks like to whoever hits it. `@abuddy/sdk` uses this pattern for
 * `typescript` and `esbuild`.
 */
async function chromium() {
  try {
    return (await import('playwright-core')).chromium;
  } catch {
    throw new Error(
      'Attaching to a running app needs `playwright-core`, which is an optional peer of @abuddy/testing.\n'
      + '  Install it: npm i -D playwright-core',
    );
  }
}

/**
 * The app's main window among the targets the connection exposes.
 *
 * **Never `pages()[0]`.** A connected app had two live targets in the spike — the window and a second one
 * — and which comes first is not something to rely on. The predicate is the fixture's own: the main
 * renderer is the page that has `window.applicationState`, which is also what tells it from the splash.
 *
 * It waits rather than asking once, because a window that is still loading has no `applicationState` yet
 * and a page can appear after the connection does.
 */
/** What finding a window needs of a connection: the pages it exposes, and `applicationState` on one. */
export interface AttachTargets {
  contexts: () => readonly { pages: () => readonly { evaluate: (fn: () => unknown) => Promise<unknown>; url: () => string }[] }[];
}

export async function findWindow<T extends AttachTargets>(browser: T, timeoutMs: number): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  const seen = new Set<unknown>();
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        if (seen.has(page)) continue;
        seen.add(page);
        const has = await page.evaluate(() => !!(window as { applicationState?: unknown }).applicationState).catch(() => false);
        if (has) return page as unknown as Page;
      }
    }
    // A page that was loading when it was checked gets looked at again
    seen.clear();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const targets = browser.contexts().flatMap((context) => context.pages().map((page) => page.url()));
  throw new Error(
    `No window with applicationState appeared within ${timeoutMs}ms. `
    + (targets.length === 0 ? 'The connection exposed no pages.' : `Saw: ${targets.join(', ')}.`),
  );
}

/**
 * Attaches to an app on `debugPort` and returns its main window.
 *
 * A connection refused is the ordinary case rather than a fault — a session file outlives the app that
 * wrote it — so it is reported as what it is, with the port, for a caller to treat as a miss.
 */
export async function attachToApp({ debugPort, timeoutMs = 15_000 }: AttachOptions): Promise<AttachedApp> {
  const connect = await chromium();
  let browser: Browser;
  try {
    browser = await connect.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  } catch (error) {
    throw new Error(`No app answered the debug port ${debugPort}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const page = await findWindow(browser, timeoutMs);
    return { page, detach: () => browser.close() };
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}
