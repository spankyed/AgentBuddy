// Whether an AgentBuddy app is running on a data dir: its API's port file names a port that answers, or the
// Electron instance lock names a live process
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { API_HOST, type AppContext } from '@abuddy/sdk/env';

/** Chromium's instance lock in the data dir: a symlink to `<hostname>-<pid>` */
const SINGLETON_LOCK = 'SingletonLock';

function portAnswers(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: API_HOST, port });
    const done = (answers: boolean) => {
      socket.destroy();
      resolve(answers);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** Whether a process with this id exists (one another user owns counts) */
function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/** The API's port file, when it names a port something listens on */
async function liveApi(apiPortFile: string, timeoutMs: number): Promise<string | null> {
  let port: number;
  try {
    port = Number(fs.readFileSync(apiPortFile, 'utf-8').trim());
  } catch {
    return null;
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return await portAnswers(port, timeoutMs) ? `its API answers on port ${port} (${apiPortFile})` : null;
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
  return processExists(pid) ? `process ${pid} holds ${lock}` : null;
}

/**
 * Why an app is running on the data dir, or `null` when none is: a stale port file or a lock left by a process that
 * has exited doesn't count
 */
export async function findRunningApp(
  context: Pick<AppContext, 'userDataDir' | 'apiPortFile'>,
  { timeoutMs = 1000 }: { timeoutMs?: number } = {},
): Promise<string | null> {
  return liveLock(context.userDataDir) ?? await liveApi(context.apiPortFile, timeoutMs);
}
