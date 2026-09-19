/**
 * Whether the process that wrote a record on disk is still running: the API's port file here, and in the app
 * the database write lock, the instance lock, staging dirs and the package build lock.
 *
 * A pid alone cannot answer it. Pids are recycled, so a record left behind by a crash names whatever took its
 * number, and reads as held for as long as the file exists — the app refuses to boot, tools refuse the data
 * dir, builds block. Bounding the pid by when the record was written clears those, at the cost of the
 * opposite error; `ifUnsure` is where a caller chooses between the two.
 *
 * `@internal`: this is app plumbing, not part of the pack contract. It lives here because `readApiEndpoint`
 * does, and that is reachable from a pack's build script, which cannot import `@abuddy/host`.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';

/** Whether a process with this id exists (one another user owns counts). */
function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/** When this machine booted: a record written before it belongs to a previous boot, whatever pid it names. */
function bootTime(): number {
  return Date.now() - os.uptime() * 1000;
}

/**
 * When `file` was last written, or `null` when it isn't there.
 *
 * `lstat`, not `stat`: Chromium's `SingletonLock` is a symlink whose target (`<host>-<pid>`) is not a path
 * and never resolves, so `stat` throws on a lock that is genuinely held and the caller reads "no app is
 * running" — the answer that lets a tool write to a database the app has open.
 * @internal
 */
export function _writtenAt(file: string): number | null {
  try {
    return fs.lstatSync(file).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Which way to be wrong, since no answer here is exact.
 *
 * - `'held'` — the pid alone decides. A dead writer whose pid this boot reassigned reads as alive (a **false
 *   held**) until someone deletes the record, and no live writer is ever missed.
 * - `'free'` — the pid, bounded by `writtenAtMs`, which clears the false held. It buys that with a **false
 *   free**, a live writer read as dead: `bootTime()` is `Date.now() - os.uptime()`, so it moves with the wall
 *   clock, and a forward step of `X` makes a record written at uptime `u` look pre-boot whenever `X > u`.
 *
 * `'free'` where a false free is harmless — staging recovery restores a directory that did not need it,
 * `readApiEndpoint` reports an API that has gone. `'held'` where a false free costs data: the database write
 * lock and the app's instance lock both guard against two writers, and there a false held is the better
 * failure, being loud and one `rm` against an error that names the file.
 *
 * Neither is exact. A pid space of ~100k against a few thousand live processes recycles within one long
 * uptime, which the bound cannot see either. The exact answer is the holder's start time
 * (`/proc/<pid>/stat`, `ps -o lstart`), read per platform; the answer with no staleness at all is an OS
 * advisory lock (`flock`/`LockFileEx`), which the kernel releases on process death. Reach for those if a
 * record's staleness ever has to be settled rather than estimated.
 * @internal
 */
export type _Liveness =
  | { ifUnsure: 'held' }
  | { ifUnsure: 'free'; writtenAtMs: number };

/**
 * Whether the process that wrote a record naming `pid` is still running, answered the way `policy` asks.
 *
 * Pass only a record this machine wrote. `os.uptime()` is this machine's boot and a foreign mtime is on
 * another clock, so a caller that can tell whose record it is must check that first.
 * @internal
 */
export function _writerIsRunning(pid: number, policy: _Liveness): boolean {
  if (!processExists(pid)) return false;
  return policy.ifUnsure === 'held' || policy.writtenAtMs >= bootTime();
}
