// One writer at a time, for work that changes files two processes would otherwise interleave on.
//
// The mechanism, not the policy: what the lock file is called and what the refusal says belong to whoever takes
// it. `database/write-lock.ts` is one caller (a tool changing a data dir's database), the CLI's code generation
// another (two `abuddy generate-entries` runs writing one pack's `src/__generated__/`, which is how this module
// came to exist — concurrent runs overwrote each other and the output read as stale).
//
// A check followed by a write cannot do this: every racer reads "nothing holds it" and then writes in turn. The
// create *is* the acquisition (`wx`, `O_EXCL`), and a lock whose holder has exited is taken over.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { lockIsHeld, sameWriter } from './process-liveness.ts';

/**
 * What the file holds. `pid` answers the question the lock exists to ask, "is the holder still running";
 * `machine` says whether that pid is this machine's to check, since a pid from another host means nothing
 * against this one's process table. A file missing either can't be resolved, and an unresolved lock counts as held.
 */
export interface LockFile {
  pid: number;
  machine: string;
  /** What the holder is doing, for the message the next arrival sees */
  what: string;
  since: string;
}

/**
 * The interruptions a release can be hung on. `SIGBREAK` is Ctrl-Break, and Windows only: registering a listener
 * for it is harmless where it doesn't exist, and without it that key leaves the lock behind.
 *
 * What none of them reach is an unconditional end — `SIGKILL`, `taskkill /F`, power loss. There the file stays and
 * the next holder takes it over, or the user removes it; an advisory lock is what would close that
 * (docs/goals/deferred/goal-write-lock-advisory.md).
 */
export const INTERRUPTS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const satisfies readonly NodeJS.Signals[];

export function readLock(file: string): LockFile | null {
  try {
    const held = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<LockFile>;
    if (typeof held.pid !== 'number' || typeof held.machine !== 'string') return null;
    return { pid: held.pid, machine: held.machine, what: String(held.what ?? 'a tool'), since: String(held.since ?? '') };
  } catch {
    return null;
  }
}

/**
 * Creates the lock with this process's details, or reports that the file is already there.
 *
 * `wx` is `O_EXCL`: the create *is* the acquisition, so two arriving together cannot both get it.
 */
function takeLock(file: string, mine: LockFile): boolean {
  let fd: number;
  try {
    fd = fs.openSync(file, 'wx');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  }
  try {
    fs.writeFileSync(fd, JSON.stringify(mine));
  } finally {
    fs.closeSync(fd);
  }
  return true;
}

/**
 * Who holds `file` right now, described, or `null` when nobody does: a lock whose process has exited doesn't count.
 * Two cases can't be resolved and count as held: a lock this version can't read, and one naming another machine,
 * whose pid means nothing here.
 *
 * `lockIsHeld` errs toward held, which means a lock whose pid this boot reassigned keeps the next arrival out until
 * someone deletes it. Releasing on interrupt makes that rare to begin with.
 */
export function findLockHolder(file: string): string | null {
  if (!fs.existsSync(file)) return null;
  const held = readLock(file);
  if (!held) return "a tool whose lock can't be read";
  if (held.machine !== os.hostname()) return `${held.what} on ${held.machine}`;
  return lockIsHeld(held.pid) ? `${held.what} (pid ${held.pid})` : null;
}

/** A lock held; `release()` is safe to call more than once */
export interface ExclusiveLock {
  release(): void;
}

/**
 * Takes `file` for the duration of some work, or throws `refuse(holder)`. A lock left by a process that has exited
 * is taken over. The caller releases it, whatever happens.
 *
 * One holder, with no re-entrancy: a second take in this process is refused like any other, naming this pid. That
 * is deliberate — nothing nests today (the build takes this only through code generation, once), and a lock that
 * quietly succeeds when you already hold it is a lock that cannot tell you that you hold it twice.
 */
export function holdExclusiveLock(options: {
  file: string;
  what: string;
  refuse: (holder: string) => Error;
}): ExclusiveLock {
  const { file, what, refuse } = options;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    // Nothing left to do on the way out; without this a process taking many locks in turn piles up listeners
    process.off('exit', release);
    for (const signal of INTERRUPTS) process.off(signal, onInterrupt);
    // Only this process's lock: a stale one another holder took over stays with it
    if (readLock(file)?.pid === process.pid) fs.rmSync(file, { force: true });
  };
  /**
   * Node runs no `exit` handler for a signal, so without this Ctrl-C leaves the lock behind and the next reader has
   * to work out that its holder is gone. Re-raising after releasing keeps the caller's view of how it ended.
   */
  function onInterrupt(signal: NodeJS.Signals): void {
    release();
    process.kill(process.pid, signal);
  }
  // Before the lock exists, not after: a process descheduled between writing the file and getting here would be
  // killed by the default disposition and leave the lock behind — the very thing these handlers are for.
  process.once('exit', release);
  for (const signal of INTERRUPTS) process.once(signal, onInterrupt);

  const mine: LockFile = { pid: process.pid, machine: os.hostname(), what, since: new Date().toISOString() };
  const fail = (holder: string): never => {
    release();
    throw refuse(holder);
  };

  try {
    if (!takeLock(file, mine)) {
      const leftover = readLock(file);
      const holder = findLockHolder(file);
      if (holder) fail(holder);
      // A lock a killed process left behind. Removing it and creating ours are two steps, so a racer that also
      // judged it stale can take it between them — narrow, and the one window `wx` cannot close, because a file's
      // existence carries no liveness. Re-read first, so this removes the leftover it judged.
      if (sameWriter(readLock(file), leftover)) fs.rmSync(file, { force: true });
      if (!takeLock(file, mine)) fail(findLockHolder(file) ?? 'another tool that took it first');
    }
  } catch (err) {
    if (!released) release();
    throw err;
  }
  return { release };
}
