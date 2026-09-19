/**
 * Whether the process that wrote a record on disk is still running: the API's port file here, and in the app
 * the database write lock, the instance lock, staging dirs and the package build lock.
 *
 * A pid alone cannot answer it. Pids are recycled, so a record left behind by a crash names whatever took its
 * number, and reads as held for as long as the file exists — the app refuses to boot, tools refuse the data
 * dir, builds block. `_writerIsRunning` bounds the pid by when the record was written.
 *
 * `@internal`: this is app plumbing, not part of the pack contract. It lives here because `readApiEndpoint`
 * does, and that is reachable from a pack's build script, which cannot import `@abuddy/host`.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';

/**
 * Whether a process with this id exists (one another user owns counts).
 * @internal
 */
export function _processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/**
 * When this machine booted: a record written before it belongs to a previous boot, whatever pid it names.
 * @internal
 */
export function _bootTime(): number {
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
 * Whether the process that wrote a record at `writtenAtMs`, naming `pid`, is still running: its pid exists
 * and the record dates from this boot. A record from an earlier boot names a pid since reassigned.
 *
 * Pass only a record this machine wrote. `os.uptime()` is this machine's boot and a foreign mtime is on
 * another clock, so a caller that can tell whose record it is — the write lock's `machine`, the instance
 * lock's hostname — must check that first.
 *
 * ## The two ways this answer can be wrong
 *
 * A **false held** says a dead holder is alive. The record outlives its writer (SIGKILL, power loss) and
 * the pid it names now belongs to something unrelated. For a lock this refuses the app or the tools, which
 * is loud and costs one `rm` — the error names the file to delete.
 *
 * A **false free** says a live holder is gone, and for a lock that means two writers on the same database.
 * Silent, and it costs data. This is the direction to protect.
 *
 * ## Why the boot bound is here, and what it is worth
 *
 * Without it, only the pid is consulted, and pids recycle. That recycling is not rare and is not only a
 * reboot thing: a pid space of ~100k against a few thousand live processes wraps within a single long
 * uptime. The bound catches only the reboot-crossing half of that — a record from a previous boot — and a
 * within-boot reuse reads the same with or without it.
 *
 * So the bound buys a partial reduction in the *likelier, milder* failure, and it buys it with a small
 * amount of the *rarer, severe* one: `Date.now() - os.uptime()` moves with the wall clock, so a forward
 * step of `X` makes a record written at uptime `u` look pre-boot whenever `X > u`, and a live holder then
 * reads as gone. Reaching it needs a step of hours taken while a holder is live and shortly after boot,
 * which is why it is accepted rather than removed.
 *
 * ## The sound alternative, if this ever bites
 *
 * Record `os.uptime()` alongside the record and treat it as a previous boot's iff the current uptime is
 * *lower*. Uptime is monotonic and clock-independent, so that test cannot fire spuriously: no false free,
 * ever. It is sound but incomplete — a record written early in the previous boot and read late in this one
 * escapes it, falling back to the pid alone — which is a strictly better trade than the one here, at the
 * cost of a field in every record's format. Per-platform start time (`/proc/<pid>/stat`, `ps -o lstart`)
 * is the exact answer and the most work.
 *
 * Do not "simplify" the bound away without deciding which failure you are choosing. Removing it does not
 * make the code safer; it trades the rare severe failure for more of the common mild one.
 * @internal
 */
export function _writerIsRunning(pid: number, writtenAtMs: number): boolean {
  return _processIsRunning(pid) && writtenAtMs >= _bootTime();
}
