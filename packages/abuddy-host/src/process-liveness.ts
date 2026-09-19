// Whether the process that wrote a record on disk is still running: the database write lock, the app's
// instance lock and port file, staging dirs and the package build lock all turn on that question.
//
// A pid alone cannot answer it. Pids are recycled, so a record left behind by a crash names whatever took
// its number, and reads as held for as long as the file exists — the app refuses to boot, tools refuse the
// data dir, builds block. `writerIsRunning` bounds the pid by when the record was written.
import * as fs from 'node:fs';
import * as os from 'node:os';

/** Whether a process with this id exists (one another user owns counts) */
export function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/** When this machine booted: a record written before it belongs to a previous boot, whatever pid it names */
export function bootTime(): number {
  return Date.now() - os.uptime() * 1000;
}

/** When `file` was last written, or `null` when it isn't there. `lstat`, so a symlink's own time is used. */
export function writtenAt(file: string): number | null {
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
 * Bounding by boot rather than the holder's start time is a deliberate tradeoff, not an oversight: start
 * time is exact but read per-platform (`/proc/<pid>/stat`, `ps -o lstart`), while `Date.now() - os.uptime()`
 * moves with the wall clock, so a forward clock step larger than a record's age at writing makes it look
 * pre-boot and a live holder look gone. That needs an NTP step of hours shortly after boot while a holder
 * is live; the recycled pid it replaces blocks the app on every reboot. Swap it for start time if the
 * clock-step case ever shows up.
 */
export function writerIsRunning(pid: number, writtenAtMs: number): boolean {
  return processIsRunning(pid) && writtenAtMs >= bootTime();
}
