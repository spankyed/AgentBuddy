import * as fs from 'node:fs';
import * as path from 'node:path';
import { bundlePackRuntime } from './be-bundler.ts';
import { holdPackBuildLock } from './build-lock.ts';
import { reloadPack, type AppPlace } from './dev-reload.ts';

/** How long to wait for the edits to stop before rebuilding */
const DEBOUNCE_MS = 300;

/**
 * **What `--watch` rebuilds is the backend runtime and nothing else**, which is less than `abuddy build`
 * does and is the point of it: it is the backend edit loop, where the runtime bundle is the only output
 * whose staleness the app can see. Measured 2026-10-07 on default-setup, 1,071 modules into a 956KB
 * bundle: **40ms** against the 23.7s a full build costs — the content, the facade types, the step build and
 * the DSL defs are the other 23.6s, and none of them moves when a system's source does.
 *
 * So an edit to a content source or to `abuddy.json` is **not** covered here, and the loop does not pretend
 * otherwise: it names what it watches on startup, and `abuddy build` is what follows those.
 */
export interface WatchOptions {
  /** Which app to ask for a reload; the shared development data dir by default */
  readonly place?: AppPlace;
  /**
   * Called after the first bundle lands, before any watching. `npm start` boots the API against the file
   * this writes, so something has to say when it is there.
   */
  readonly onFirstBuild?: () => void;
}

/**
 * One rebuild. Reports rather than throws: a watcher that dies on a syntax error is a worse loop.
 *
 * **Under the pack's build lock, because this one writes into the live `dist`** rather than staging — it is
 * one bundle, which is what makes it 40ms against a full build. A full build renames `dist` aside, so without
 * the lock a rebuild landing in that window writes `runtime/index.cjs` into a directory that is about to be
 * deleted: the app then reloads the pack and gets the runtime from before the edit, with nothing reporting it.
 */
async function rebuild(root: string, packId: string): Promise<boolean> {
  const lock = await holdPackBuildLock(root, { packId, what: 'abuddy build --watch (a rebuild)' });
  try {
    const result = await bundlePackRuntime(root, path.join(root, 'dist'), {});
    if (!result.success) console.error(`[watch] Runtime bundle failed: ${result.error}`);
    return result.success;
  } finally {
    lock.release();
  }
}

/**
 * One run at a time, and never a lost request.
 *
 * Two things a watcher has to get right, and they pull in opposite directions. Edits arrive in bursts — a
 * formatter saving a file writes it more than once — so a request **debounces**, and the run happens once
 * the edits stop. But a bundle takes time, and an edit landing while one is in flight is the most ordinary
 * thing there is: a `return` on a busy flag loses it, and the author is then looking at an app built from
 * the file before the one they just saved, with the loop reporting nothing wrong.
 *
 * So a request that arrives mid-run is remembered and taken when that run finishes, and several of them
 * collapse into one further run rather than a queue of them. A failed run is no different: the request that
 * came in while it was failing is the author fixing the error.
 *
 * `run` is awaited and must not throw — `rebuild` reports instead, so that a syntax error doesn't end the
 * loop.
 */
export function coalescingRunner(run: () => Promise<void>, delayMs: number = DEBOUNCE_MS): { request: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let pending = false;

  async function drain(): Promise<void> {
    running = true;
    try {
      // Cleared before the run, not after: a request that arrives during it is for the next one
      do { pending = false; await run(); } while (pending);
    } finally {
      running = false;
    }
  }

  return {
    request() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (running) { pending = true; return; }
        void drain();
      }, delayMs);
    },
  };
}

/**
 * Watch a pack's sources, rebuild its backend runtime, and ask a running app to reload it. Never returns.
 */
export async function watchPackRuntime(root: string, packId: string, options: WatchOptions = {}): Promise<never> {
  const srcDir = path.join(root, 'src');
  if (!fs.existsSync(srcDir)) throw new Error(`No ${srcDir} to watch`);

  if (!(await rebuild(root, packId))) {
    // The first bundle is the one nothing else can stand in for: whatever asked for this loop is waiting
    // on the file, and watching on from here would leave it waiting with no error to read
    throw new Error('The first runtime bundle failed; fix the error above and start again');
  }
  console.log('[watch] Runtime built');
  options.onFirstBuild?.();

  // The edit the next run is for. A run reads it when it starts rather than closing over one filename,
  // since a run can cover several edits
  let lastChange = '';
  const runs = coalescingRunner(async () => {
    const changed = lastChange;
    if (!(await rebuild(root, packId))) return;
    const reload = await reloadPack(packId, options.place);
    if (reload.status === 'reloaded') console.log(`[watch] ${changed} — reloaded`);
    else console.warn(`[watch] ${changed} — rebuilt, but the app did not reload (${reload.detail})`);
  });

  fs.watch(srcDir, { recursive: true }, (_event, filename) => {
    // A `.vue` or `.css` edit is the frontend's, which the renderer serves from source under `npm start`
    if (!filename || !/\.tsx?$/.test(filename) || filename.endsWith('.d.ts')) return;
    lastChange = filename;
    runs.request();
  });

  console.log(`[watch] Watching ${path.relative(root, srcDir) || srcDir} for backend changes`);
  return new Promise<never>(() => {});
}
