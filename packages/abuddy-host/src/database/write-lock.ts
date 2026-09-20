// The lock a tool holds while it changes a data dir's database (`abuddy db`), so an app that starts meanwhile
// refuses to open the same database instead of overwriting the change from its own memory. A check alone can't do
// that: the app could start in the moment between the check and the write.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { lockIsHeld } from '../process-liveness.ts';

/**
 * What the file holds. `pid` answers the question the lock exists to ask, "is the holder still running";
 * `machine` says whether that pid is this machine's to check, since a pid from another host means nothing
 * against this one's process table. A file missing either can't be resolved, and an unresolved lock counts
 * as held.
 */
interface LockFile {
  pid: number;
  machine: string;
  /** What the holder is doing, for the message the app shows */
  what: string;
  since: string;
}

const lockFile = (userDataDir: string) => path.join(userDataDir, 'db-write.lock');

/** Signals a tool is interrupted with, which `exit` handlers never see */
const INTERRUPTS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const satisfies readonly NodeJS.Signals[];

function readLock(file: string): LockFile | null {
  try {
    const held = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<LockFile>;
    if (typeof held.pid !== 'number' || typeof held.machine !== 'string') return null;
    return {
      pid: held.pid,
      machine: held.machine,
      what: String(held.what ?? 'a tool'),
      since: String(held.since ?? ''),
    };
  } catch {
    return null;
  }
}

/**
 * What a tool is changing in this data dir's database right now, or `null` when nothing is: a lock whose process has
 * exited doesn't count. Two cases can't be resolved and count as held: a lock this version can't read, and
 * one naming another machine, whose pid means nothing here.
 *
 * `lockIsHeld` errs toward held, which here means a lock whose pid this boot reassigned keeps the app out
 * until someone deletes it. Releasing on interrupt makes that rare to begin with.
 */
export function findDatabaseWriter(userDataDir: string): string | null {
  const file = lockFile(userDataDir);
  if (!fs.existsSync(file)) return null;
  const held = readLock(file);
  if (!held) return "a tool whose lock can't be read";
  if (held.machine !== os.hostname()) return `${held.what} on ${held.machine}`;
  return lockIsHeld(held.pid) ? `${held.what} (pid ${held.pid})` : null;
}

/** Where the lock is, and that removing it is the way out when no tool is really running */
const clearHint = (userDataDir: string) =>
  `If no tool is running, delete ${lockFile(userDataDir)} and try again.`;

/** A lock a tool holds; `release()` is safe to call more than once */
export interface DatabaseWriteLock {
  release(): void;
}

/**
 * Takes the lock for `userDataDir` while a tool changes its database. Throws when another tool holds it; a lock left
 * by a process that has exited is taken over. The caller releases it, whatever happens.
 */
export function holdDatabaseWriteLock(userDataDir: string, what: string): DatabaseWriteLock {
  const file = lockFile(userDataDir);
  const held = findDatabaseWriter(userDataDir);
  if (held) throw new Error(`Another tool is changing the database in ${userDataDir}: ${held}. ${clearHint(userDataDir)}`);
  fs.mkdirSync(userDataDir, { recursive: true });

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    // Nothing left to do on the way out; without this a process taking many locks in turn (the tests) piles up
    // listeners
    process.off('exit', release);
    for (const signal of INTERRUPTS) process.off(signal, onInterrupt);
    // Only this process's lock: a stale one another tool took over stays with it
    if (readLock(file)?.pid === process.pid) fs.rmSync(file, { force: true });
  };
  /**
   * Node runs no `exit` handler for a signal, so without this Ctrl-C on any `abuddy db` command leaves the lock
   * behind and the next reader has to work out that its holder is gone. Re-raising after releasing keeps the
   * caller's view of how the command ended: its own listener is gone by then, so the default action applies.
   */
  function onInterrupt(signal: NodeJS.Signals): void {
    release();
    process.kill(process.pid, signal);
  }
  // Before the lock exists, not after: a process that is descheduled between writing the file and getting
  // here would be killed by the default disposition and leave the lock behind — the very thing these
  // handlers are for. Registered first, there is no moment when the file is on disk unguarded.
  process.once('exit', release);
  for (const signal of INTERRUPTS) process.once(signal, onInterrupt);

  // Written aside and renamed, so no app ever reads a half-written lock
  const temp = `${file}.${process.pid}.tmp`;
  const mine: LockFile = { pid: process.pid, machine: os.hostname(), what, since: new Date().toISOString() };
  try {
    fs.writeFileSync(temp, JSON.stringify(mine));
    fs.renameSync(temp, file);
  } catch (err) {
    // No lock was taken, so this only drops the handlers registered above
    release();
    throw err;
  }
  return { release };
}

/**
 * Throws when a tool holds the lock for `userDataDir`: the app refuses to open a database another process is in the
 * middle of changing, rather than starting on data that is about to change under it.
 */
export function assertNoDatabaseWriter(userDataDir: string): void {
  const held = findDatabaseWriter(userDataDir);
  if (held) {
    throw new Error(
      `The database in ${userDataDir} is being changed by ${held}. Wait for it to finish, then start AgentBuddy again. ` +
      clearHint(userDataDir),
    );
  }
}
