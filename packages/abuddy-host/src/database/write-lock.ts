// The lock a tool holds while it changes a data dir's database (`abuddy db`), so an app that starts meanwhile
// refuses to open the same database instead of overwriting the change from its own memory. A check alone can't do
// that: the app could start in the moment between the check and the write.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { _writerIsRunning, _writtenAt } from '@abuddy/sdk/env';

/**
 * What a reader may find in the file. `pid` is the authority: it is the only field that answers the question
 * the lock exists to answer, "is the holder still running". `machine` answers a narrower one, "is that pid
 * mine to check", so it is optional here — a lock naming no machine is still one whose pid can be read, and
 * reading it as unreadable instead would refuse the app with nothing running and no way out but deleting the
 * file by hand.
 *
 * The narrowing is deliberate, not tolerance for an old format: `machine` is absent only in a file this
 * module did not write, because `WrittenLock` makes the writer set it. A foreign writer that omitted it
 * while running on another host would have its pid compared against this host's process table, which is
 * why the field is required on the way out and optional on the way in.
 */
interface LockFile {
  pid: number;
  machine?: string;
  /** What the holder is doing, for the message the app shows */
  what: string;
  since: string;
}

/** What this module writes: every field a reader can use to resolve the lock without guessing */
type WrittenLock = Required<LockFile>;

const lockFile = (userDataDir: string) => path.join(userDataDir, 'db-write.lock');

function readLock(file: string): LockFile | null {
  try {
    const held = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<LockFile>;
    // Only an unreadable pid makes a lock unreadable: without it nothing can say whether the holder still runs
    if (typeof held.pid !== 'number') return null;
    return {
      pid: held.pid,
      machine: typeof held.machine === 'string' ? held.machine : undefined,
      what: String(held.what ?? 'a tool'),
      since: String(held.since ?? ''),
    };
  } catch {
    return null;
  }
}

/**
 * What a tool is changing in this data dir's database right now, or `null` when nothing is: a lock whose process has
 * exited doesn't count, nor does one left by a previous boot, whose pid this boot has reassigned. Two cases
 * can't be resolved and count as held: a lock with no readable pid, and one naming another machine, whose
 * pid means nothing here. A lock naming no machine is settled by its pid, which is the best answer
 * available and better than refusing forever.
 */
export function findDatabaseWriter(userDataDir: string): string | null {
  const file = lockFile(userDataDir);
  if (!fs.existsSync(file)) return null;
  const held = readLock(file);
  if (!held) return "a tool whose lock can't be read";
  if (held.machine !== undefined && held.machine !== os.hostname()) return `${held.what} on ${held.machine}`;
  // A lock from a previous boot names a pid this boot reassigned, so the pid alone can't settle it
  const at = _writtenAt(file);
  if (at === null) return null;
  return _writerIsRunning(held.pid, at) ? `${held.what} (pid ${held.pid})` : null;
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
  // Written aside and renamed, so no app ever reads a half-written lock
  const temp = `${file}.${process.pid}.tmp`;
  const mine: WrittenLock = { pid: process.pid, machine: os.hostname(), what, since: new Date().toISOString() };
  fs.writeFileSync(temp, JSON.stringify(mine));
  fs.renameSync(temp, file);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    // Nothing left to do at exit; without this a process taking many locks in turn (the tests) piles up listeners
    process.off('exit', release);
    // Only this process's lock: a stale one another tool took over stays with it
    if (readLock(file)?.pid === process.pid) fs.rmSync(file, { force: true });
  };
  // A tool killed mid-write leaves the lock; the next reader sees its pid is gone
  process.once('exit', release);
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
