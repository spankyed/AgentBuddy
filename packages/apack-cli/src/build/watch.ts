import * as fs from 'node:fs';
import * as path from 'node:path';
import { createPackBuilder, type PackBuilder } from './build-process.ts';
import { withBuildSignals } from './build-signals.ts';
import { readValidManifest } from '../utils.ts';
import { isPackInputPath, packInputWatchTargets, packInputsHash } from '@apackdev/host/build/pack-inputs';
import { reloadPack, type AppPlace } from './dev-reload.ts';
import { compilerWatchPaths, createCompilerWatchTools, compilerWatchTargets, createCompilerWatchMatcher, mergeCompilerWatchPaths, additionalCompilerObservations, type CompilerWatchPaths } from './compiler-watch.ts';
import { createFrontendWatcher, type FrontendInputSnapshot } from './frontend-watch.ts';
import type { BuildWatchInputs } from './build-watch-inputs.ts';
import { resolveAppEnvironment } from '@apackdev/sdk/env';
import { readPackBuildInputs } from '@apackdev/host/build/pack-build-inputs';
import { assertNativeCompilerObservations, type CompilerInputObservations } from '@apackdev/host/build/compiler-inputs';

const DEBOUNCE_MS = 300;

export interface WatchOptions {
  readonly signal?: AbortSignal;
  readonly place?: AppPlace;
  /** Initial verified publication is ready for an app to boot against. */
  readonly onFirstBuild?: () => void;
  /** Install an external pack's verified output before asking its host to reload it. */
  readonly onBuilt?: () => Promise<void>;
  /** A dev session owns its shared compiler; standalone watchers own their builder. */
  readonly build?: PackBuilder['build'];
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
  options.signal?.throwIfAborted();
  const packId = readValidManifest(root).id;
  const builder = options.build ? undefined : createPackBuilder(root);
  const build = options.build ?? builder!.build;
  let closed = false;
  let stopping: Promise<void> | undefined;
  let ready = false;
  let pending = false;
  let lastChange = '';
  const tools = createCompilerWatchTools(root);
  let compilerPaths: CompilerWatchPaths = new Map();
  let observedPaths: CompilerWatchPaths = new Map();
  let acceptedObservations: CompilerInputObservations | undefined;
  const observedInputsCurrent = () => {
    if (!acceptedObservations) return true;
    try { assertNativeCompilerObservations(acceptedObservations); return true; }
    catch { return false; }
  };
  let matchesCompilerInput = createCompilerWatchMatcher(compilerPaths);
  let compilerSignature: string | undefined;
  let authoredSignature: string | undefined;
  let frontendSignature: string | undefined;
  const invalidateInputs = () => {
    compilerSignature = undefined;
    authoredSignature = undefined;
    frontendSignature = undefined;
  };
  const dataDirectory = options.place?.userDataDir ?? (options.place ? resolveAppEnvironment(options.place).userDataDir : undefined);
  const frontend = createFrontendWatcher(root, dataDirectory,
    file => request(path.relative(root, file)));
  const publish = async (): Promise<boolean> => {
    const compiler = refreshInputs();
    const authored = packInputsHash(root) + JSON.stringify(compiler.authored);
    const beforeFrontend = frontend.snapshot();
    if (compiler.signature === compilerSignature && authored === authoredSignature && beforeFrontend.hash === frontendSignature && observedInputsCurrent()) return false;
    compilerSignature = compiler.signature;
    authoredSignature = authored;
    frontendSignature = beforeFrontend.hash;
    if (readValidManifest(root).id !== packId) throw new Error('Pack identity changed; restart the development session');
    let reported: { inputs: BuildWatchInputs; snapshot: FrontendInputSnapshot } | undefined;
    let observed: CompilerWatchPaths = new Map();
    let nativeReported = false;
    try {
      await build({ signal: options.signal, onInputs: async inputs => {
        if (inputs.probes) { nativeReported = true; observed = mergeCompilerWatchPaths(observed, new Map(inputs.probes)); return; }
        reported = { inputs, snapshot: await frontend.observe(inputs) };
      } });
      if (closed) return false;
      acceptedObservations = nativeReported ? additionalCompilerObservations({
        root: fs.realpathSync(root), entries: readPackBuildInputs(path.join(root, 'dist')).observations,
      }, observed, compiler.staticPaths) : undefined;
      observedPaths = observed;
    } catch (error) {
      // Failed workers can discover absent inputs. Subscribe before waiting for their repair.
      if (!closed) {
        observedPaths = mergeCompilerWatchPaths(observedPaths, observed);
        refreshInputs();
      }
      throw error;
    }
    if (closed) return false;
    const accepted = reported?.inputs.successful ? reported.inputs : { files: [], directories: [], successful: true };
    await frontend.accept(accepted);
    if (closed) return false;
    const frontendChanged = !beforeFrontend.current() || (reported && !reported.snapshot.current());
    frontendSignature = frontendChanged ? beforeFrontend.hash : reported?.snapshot.hash ?? frontend.snapshot().hash;
    // Close the discovery/subscription window before retaining the initial tooling inventory.
    if (!ready) tools.changed(undefined, 'rename');
    const after = refreshInputs(true);
    if (frontendChanged || !observedInputsCurrent() || after.signature !== compiler.signature || packInputsHash(root) + JSON.stringify(after.authored) !== authored) {
      request('inputs changed during the build');
    }
    return true;
  };
  const runs = coalescingRunner(async () => {
    if (closed) return;
    const changed = lastChange;
    try {
      if (!await publish()) return;
      if (closed) return;
      await options.onBuilt?.();
      if (closed) return;
      const reload = await reloadPack(packId, options.place);
      if (reload.status === 'reloaded') console.log(`[watch] ${changed} — reloaded`);
      else {
        if (reload.status === 'failed' || reload.status === 'unreachable') invalidateInputs();
        console.warn(`[watch] ${changed} — built, but the app did not reload (${reload.detail})`);
      }
    } catch (error) {
      // A failed build/install/reload must not suppress a later save with identical inputs.
      invalidateInputs();
      if (!closed) console.error(`[watch] Build/reload failed: ${String(error)}`);
    }
  });
  const request = (relative: string) => {
    if (closed) return;
    lastChange = relative;
    if (ready) runs.request();
    else pending = true;
  };
  // Keep the root subscribed while replacing link watches, including during failed builds.
  const watcher = fs.watch(root, { recursive: true }, (event, filename) => {
    tools.changed(filename ? path.resolve(root, filename) : undefined, event);
    if (!filename || isPackInputPath(filename)) request(filename ?? 'authored inputs');
    else if (matchesCompilerInput(path.resolve(root, filename), event)) request(filename);
  });
  let links: fs.FSWatcher[] = [];
  function refreshInputs(replace = false) {
    const next: fs.FSWatcher[] = [];
    const compiler = compilerWatchPaths(root, tools, observedPaths);
    const paths = replace && compiler.complete ? compiler.paths : mergeCompilerWatchPaths(compilerPaths, compiler.paths);
    const authored = packInputWatchTargets(root);
    try {
      for (const target of authored.slice(1)) {
        next.push(fs.watch(target.directory, { recursive: true }, (_event, filename) => {
          if (target.child && filename && filename !== target.child) return;
          const relative = target.child ? target.relative : path.join(target.relative, filename ?? '');
          if (isPackInputPath(relative)) request(relative);
        }));
      }
      for (const [directory, target] of compilerWatchTargets(paths, root)) {
        const matches = createCompilerWatchMatcher(target.paths);
        next.push(fs.watch(directory, { recursive: target.recursive }, (event, filename) => {
          if (!filename || matches(path.resolve(directory, filename), event)) {
            tools.changed(filename ? path.resolve(directory, filename) : undefined, event);
            request(path.relative(root, path.resolve(directory, filename ?? '')));
          }
        }));
      }
    } catch (error) {
      for (const watch of next) watch.close();
      throw error;
    }
    for (const watch of links) watch.close();
    links = next;
    compilerPaths = paths;
    matchesCompilerInput = createCompilerWatchMatcher(paths);
    return { ...compiler, authored };
  }
  const close = () => {
    if (!stopping) {
      options.signal?.removeEventListener('abort', abort);
      closed = true; watcher.close(); for (const watch of links) watch.close();
      stopping = Promise.all([frontend.close(), runs.close(), builder?.close()]).then(() => {});
    }
    return stopping;
  };
  // Startup and the returned close promise report cleanup errors to the owner.
  const abort = () => { void close().catch(() => {}); };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    options.signal?.throwIfAborted();
    await publish();
    options.signal?.throwIfAborted();
    options.onFirstBuild?.();
    ready = true;
    if (pending) runs.request();
    console.log('[watch] Watching build inputs; each successful build publishes verified dist/');
    return { close };
  } catch (error) {
    await close();
    throw error;
  }
}

export async function watchPackBuild(root: string, options: WatchOptions = {}): Promise<void> {
  await withBuildSignals(async stoppedByProcess => {
    const signal = options.signal ? AbortSignal.any([options.signal, stoppedByProcess]) : stoppedByProcess;
    let notifyStopped!: () => void;
    const stopped = new Promise<void>(resolve => { notifyStopped = resolve; });
    signal.addEventListener('abort', notifyStopped, { once: true });
    if (signal.aborted) notifyStopped();
    let watcher: Awaited<ReturnType<typeof startPackBuildWatcher>> | undefined;
    try {
      watcher = await startPackBuildWatcher(root, { ...options, signal });
      await stopped;
    } finally {
      signal.removeEventListener('abort', notifyStopped);
      await watcher?.close();
    }
    signal.throwIfAborted();
  });
}
