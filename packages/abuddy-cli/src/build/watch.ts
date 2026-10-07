import * as fs from 'node:fs';
import * as path from 'node:path';
import { bundlePackRuntime } from './be-bundler.ts';
import { reloadPack, type AppPlace } from './dev-reload.ts';

/** How long to wait for the edits to stop before rebuilding */
const DEBOUNCE_MS = 300;

/**
 * **What `--watch` rebuilds is the backend runtime and nothing else**, which is less than `abuddy build`
 * does and is the point of it: it is the backend edit loop, where the runtime bundle is the only output
 * whose staleness the app can see. Measured 2026-10-07 on default-setup, 1,071 modules into a 956KB
 * bundle: **40ms** against the 23.7s a full build costs — the seeds, the facade types, the step build and
 * the DSL defs are the other 23.6s, and none of them moves when a system's source does.
 *
 * So an edit to a seed source or to `abuddy.json` is **not** covered here, and the loop does not pretend
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

/** One rebuild. Reports rather than throws: a watcher that dies on a syntax error is a worse loop. */
async function rebuild(root: string): Promise<boolean> {
  const result = await bundlePackRuntime(root, path.join(root, 'dist'), {});
  if (!result.success) console.error(`[watch] Runtime bundle failed: ${result.error}`);
  return result.success;
}

/**
 * Watch a pack's sources, rebuild its backend runtime, and ask a running app to reload it. Never returns.
 */
export async function watchPackRuntime(root: string, packId: string, options: WatchOptions = {}): Promise<never> {
  const srcDir = path.join(root, 'src');
  if (!fs.existsSync(srcDir)) throw new Error(`No ${srcDir} to watch`);

  if (!(await rebuild(root))) {
    // The first bundle is the one nothing else can stand in for: whatever asked for this loop is waiting
    // on the file, and watching on from here would leave it waiting with no error to read
    throw new Error('The first runtime bundle failed; fix the error above and start again');
  }
  console.log('[watch] Runtime built');
  options.onFirstBuild?.();

  let timer: ReturnType<typeof setTimeout> | null = null;
  let building = false;
  fs.watch(srcDir, { recursive: true }, (_event, filename) => {
    // A `.vue` or `.css` edit is the frontend's, which the renderer serves from source under `npm start`
    if (!filename || !/\.tsx?$/.test(filename) || filename.endsWith('.d.ts')) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (building) return;
      building = true;
      try {
        if (!(await rebuild(root))) return;
        const reload = await reloadPack(packId, options.place);
        if (reload.status === 'reloaded') console.log(`[watch] ${filename} — reloaded`);
        else console.warn(`[watch] ${filename} — rebuilt, but the app did not reload (${reload.detail})`);
      } finally {
        building = false;
      }
    }, DEBOUNCE_MS);
  });

  console.log(`[watch] Watching ${path.relative(root, srcDir) || srcDir} for backend changes`);
  return new Promise<never>(() => {});
}
