import * as fs from 'node:fs';
import * as path from 'node:path';
import { build } from '../commands/build.ts';
import { readValidManifest } from '../utils.ts';
import { isPackInputPath, packInputWatchTargets } from './pack-inputs.ts';
import { reloadPack, type AppPlace } from './dev-reload.ts';

const DEBOUNCE_MS = 300;

export interface WatchOptions {
  readonly place?: AppPlace;
  /** Initial verified publication is ready for an app to boot against. */
  readonly onFirstBuild?: () => void;
  /** Install an external pack's verified output before asking its host to reload it. */
  readonly onBuilt?: () => Promise<void>;
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
export function coalescingRunner(run: () => Promise<void>, delayMs: number = DEBOUNCE_MS): { request: () => void; close: () => Promise<void> } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let pending = false;
  let closed = false;
  let active: Promise<void> | undefined;

  async function drain(): Promise<void> {
    running = true;
    try {
      // Cleared before the run, not after: a request that arrives during it is for the next one
      do { pending = false; await run(); } while (pending && !closed);
    } finally {
      running = false;
    }
  }

  return {
    close() { closed = true; pending = false; if (timer) clearTimeout(timer); return active ?? Promise.resolve(); },
    request() {
      if (closed) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (running) { pending = true; return; }
        active = drain();
      }, delayMs);
    },
  };
}

/** Every edit publishes the same complete build as a normal build, then requests reload. */
export async function startPackBuildWatcher(root: string, options: WatchOptions = {}): Promise<{ close: () => Promise<void> }> {
  const packId = readValidManifest(root).id;
  let closed = false;
  let ready = false;
  let pending = false;
  let lastChange = '';
  const publish = async () => {
    refreshLinks();
    if (readValidManifest(root).id !== packId) throw new Error('Pack identity changed; restart the development session');
    await build([], root);
  };
  const runs = coalescingRunner(async () => {
    if (closed) return;
    const changed = lastChange;
    try {
      await publish();
      if (closed) return;
      await options.onBuilt?.();
      if (closed) return;
      const reload = await reloadPack(packId, options.place);
      if (reload.status === 'reloaded') console.log(`[watch] ${changed} — reloaded`);
      else console.warn(`[watch] ${changed} — built, but the app did not reload (${reload.detail})`);
    } catch (error) {
      console.error(`[watch] Build/reload failed: ${String(error)}`);
    }
  });
  const request = (relative: string) => {
    if (closed || !isPackInputPath(relative)) return;
    lastChange = relative;
    if (ready) runs.request();
    else pending = true;
  };
  // Keep the root subscribed while replacing link watches, including during failed builds.
  const watcher = fs.watch(root, { recursive: true }, (_event, filename) => request(filename ?? 'authored inputs'));
  let links: fs.FSWatcher[] = [];
  function refreshLinks(): void {
    const next: fs.FSWatcher[] = [];
    try {
      for (const target of packInputWatchTargets(root).slice(1)) {
        next.push(fs.watch(target.directory, { recursive: true }, (_event, filename) => {
          if (target.child && filename && filename !== target.child) return;
          request(target.child ? target.relative : path.join(target.relative, filename ?? ''));
        }));
      }
    } catch (error) {
      for (const watch of next) watch.close();
      throw error;
    }
    for (const watch of links) watch.close();
    links = next;
  }
  const close = () => { closed = true; watcher.close(); for (const watch of links) watch.close(); return runs.close(); };
  try {
    await publish();
    options.onFirstBuild?.();
    ready = true;
    if (pending) runs.request();
    console.log('[watch] Watching authored pack inputs; each successful build publishes verified dist/');
    return { close };
  } catch (error) {
    await close();
    throw error;
  }
}

export async function watchPackBuild(root: string, options: WatchOptions = {}): Promise<never> {
  await startPackBuildWatcher(root, options);
  return new Promise<never>(() => {});
}
