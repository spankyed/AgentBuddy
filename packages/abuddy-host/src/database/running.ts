// Whether an AgentBuddy app is running on a data dir: the app process said so, or its API's port file
// names a port whose process is running
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AppContext } from '@abuddy/sdk/env';
import { lockIsHeld, readApiEndpoint } from '../process-liveness.ts';

/** What the app process publishes in the data dir for as long as it runs */
const APP_LOCK = 'app.lock';

interface AppLock {
  pid: number;
  machine: string;
  since: string;
}

/** Where the app publishes that it is using a data dir */
export const appLockFile = (userDataDir: string): string => path.join(userDataDir, APP_LOCK);

/**
 * Publishes that this process is using `userDataDir`, and returns the way to take it back.
 *
 * The Electron main process calls this before it starts anything: it is using the data dir from that
 * moment, and its API — which is what actually opens the database — publishes its port only once it has
 * booted. Between those two moments, and again while a crashed API is being restarted, the port file says
 * no app is here and this is the only thing that says otherwise.
 *
 * Read by `abuddy db`, never by the app itself; a tool that finds it refuses rather than writing under a
 * running app. It is not a mutual-exclusion lock — `requestSingleInstanceLock()` is what keeps one app per
 * data dir — so it does not need an atomic create.
 */
export function publishRunningApp(userDataDir: string): () => void {
  const file = appLockFile(userDataDir);
  const mine: AppLock = { pid: process.pid, machine: os.hostname(), since: new Date().toISOString() };
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(mine));
  return () => {
    // Only this process's: an app that crashed and was restarted has already replaced it
    try {
      const held = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<AppLock>;
      if (held.pid === process.pid) fs.rmSync(file, { force: true });
    } catch { /* gone, or unreadable: nothing of ours to remove */ }
  };
}

/** The API this data dir's port file names, while its process is running */
function liveApi(apiPortFile: string): string | null {
  const endpoint = readApiEndpoint(apiPortFile);
  return endpoint && `its API is running on port ${endpoint.port} (pid ${endpoint.pid})`;
}

/**
 * The app process that published itself here, when it is still running.
 *
 * A file this app wrote, not another product's: this read Chromium's `SingletonLock` before, which is a
 * symlink it only writes on POSIX, and which failed *open* — a format change, or Windows, and the answer
 * was silently "no app".
 */
function liveApp(userDataDir: string): string | null {
  const file = appLockFile(userDataDir);
  let held: Partial<AppLock>;
  try {
    held = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<AppLock>;
  } catch (err) {
    // Unreadable is not absent: a file that is there and makes no sense is one we can't resolve, and the
    // safe answer for something guarding a database is that an app may be using it
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return `${file} is there and can't be read`;
  }
  if (typeof held.pid !== 'number' || typeof held.machine !== 'string') return `${file} is there and can't be read`;
  if (held.machine !== os.hostname()) return `its process is running on ${held.machine}`;
  return lockIsHeld(held.pid) ? `its process is running (pid ${held.pid})` : null;
}

/**
 * Why an app is running on the data dir, or `null` when none is: a file or a port file left behind by a
 * process that has exited doesn't count
 */
export function findRunningApp(context: Pick<AppContext, 'userDataDir' | 'apiPortFile'>): string | null {
  return liveApp(context.userDataDir) ?? liveApi(context.apiPortFile);
}
