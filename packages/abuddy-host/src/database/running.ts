// Whether an AgentBuddy app is running on a data dir: its API's port file names a port that answers, or the
// Electron instance lock names a live process
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readApiEndpoint, type AppContext } from '@abuddy/sdk/env';
import { _lockIsHeld } from '@abuddy/sdk/env';

/** Chromium's instance lock in the data dir: a symlink to `<hostname>-<pid>` */
const SINGLETON_LOCK = 'SingletonLock';

/** The API this data dir's port file names, while its process is running */
function liveApi(apiPortFile: string): string | null {
  const endpoint = readApiEndpoint(apiPortFile);
  return endpoint && `its API is running on port ${endpoint.port} (pid ${endpoint.pid})`;
}

/** The instance lock, when a live process holds it (or a process on another host, which can't be checked) */
function liveLock(userDataDir: string): string | null {
  const lock = path.join(userDataDir, SINGLETON_LOCK);
  let target: string;
  try {
    target = fs.readlinkSync(lock);
  } catch {
    return null;
  }
  const dash = target.lastIndexOf('-');
  const [host, pid] = [target.slice(0, dash), Number(target.slice(dash + 1))];
  if (dash <= 0 || !Number.isInteger(pid) || pid <= 0) return `${lock} is held (${target})`;
  if (host !== os.hostname()) return `${lock} is held by a process on ${host}`;
  return _lockIsHeld(pid) ? `process ${pid} holds ${lock}` : null;
}

/**
 * Why an app is running on the data dir, or `null` when none is: a port file or an instance lock left behind by a
 * process that has exited doesn't count
 */
export function findRunningApp(context: Pick<AppContext, 'userDataDir' | 'apiPortFile'>): string | null {
  return liveLock(context.userDataDir) ?? liveApi(context.apiPortFile);
}
