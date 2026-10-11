// What a dev session holds while it runs, and the order it lets go of it.
//
// **Two phases, because one step cannot be synchronous and the process `exit` handler can only do work that
// is.** Removing a throwaway data dir while the app still has LMDB's files and its own log dir open is noisy
// on macOS, and on Windows an EBUSY that leaves the directory half removed — so the app goes first and the
// directory follows it. `releaseNow` is what `exit` can do; `release` is every other way a session ends.
//
// **One owner, rather than a slot and a flag per resource beside the closures that read them.** What each
// release waits for is the one before it, which is an order; an order nothing names is one every caller has
// to get right again, and this one took two goes. `tests/app/dev-hold.spec.ts` is where it is written down.
import type { ChildProcess } from 'node:child_process';

/** How long an app gets to go on its own before it is killed outright */
const EXIT_GRACE_MS = 10_000;

/** Resolves once the child is gone, killing it outright if it will not go. */
export function exited(child: ChildProcess, timeoutMs = EXIT_GRACE_MS): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export interface DevHoldIo {
  /** Removes the dev server marker, for a session that wrote one */
  removeMarker: (packId: string) => void;
  /** Removes the throwaway data dir, for a session that made one — only once the app has gone */
  removeProfile?: () => void;
  /** Injected by a spec, which has no app to wait for */
  awaitExit?: (app: ChildProcess) => Promise<void>;
}

export interface DevHold {
  /** The app this session started, which is the only one it may close */
  holdsApp: (app: ChildProcess) => void;
  /**
   * Forgets it. Ours was refused the data dir and another app has it, so this session started none that
   * lived; without this the release would close an app it did not start.
   */
  forgetApp: () => void;
  holdsServer: (server: { close: () => unknown }) => void;
  holdsMarker: (packId: string) => void;
  /** Removes the session file this session published */
  holdsSession: (unpublish: () => void) => void;
  /** Everything a synchronous `exit` handler can do. Idempotent */
  releaseNow: () => void;
  /** `releaseNow`, then what had to wait for the app. Idempotent */
  release: () => Promise<void>;
}

export function createDevHold(io: DevHoldIo): DevHold {
  const awaitExit = io.awaitExit ?? (app => exited(app));
  let app: ChildProcess | undefined;
  let server: { close: () => unknown } | undefined;
  let marker: string | undefined;
  let unpublish: (() => void) | undefined;
  let releasedNow = false;
  let released = false;

  // One-shot: `release` calls this and then the caller exits, which fires the `exit` handler and would
  // otherwise close the dev server and remove the marker a second time
  const releaseNow = (): void => {
    if (releasedNow) return;
    releasedNow = true;
    // The records before the things they describe: one naming a session that has gone is a record of
    // something that is not there
    if (marker !== undefined) io.removeMarker(marker);
    unpublish?.();
    server?.close();
    app?.kill();
  };

  return {
    holdsApp: next => { app = next; },
    forgetApp: () => { app = undefined; },
    holdsServer: next => { server = next; },
    holdsMarker: packId => { marker = packId; },
    holdsSession: next => { unpublish = next; },
    releaseNow,
    release: async () => {
      if (released) return;
      released = true;
      releaseNow();
      if (app) await awaitExit(app);
      io.removeProfile?.();
    },
  };
}
