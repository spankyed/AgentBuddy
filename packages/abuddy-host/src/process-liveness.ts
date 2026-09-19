// Whether the process that wrote a record on disk is still running. Three modules asked that question with
// three copies of `process.kill(pid, 0)` and only one of them bounded the answer, which is the half that
// matters: pids are recycled, so after a reboot a record's pid is very likely an unrelated process and the
// record reads as held forever. The module where that was cheapest (a staging dir goes uncollected) had the
// bound; the two where it is expensive — the app refuses to boot, tools refuse to touch the data dir — did
// not.
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
 * Whether the process that wrote a record at `writtenAtMs`, naming `pid`, is still running.
 *
 * Only for a record this machine wrote: `os.uptime()` is this machine's boot, and an mtime from another host
 * is on another clock. Callers that can tell whose record it is — the write lock's `machine`, the instance
 * lock's hostname — check that first and never reach here for a foreign one.
 *
 * The bound is the boot epoch rather than the holder's start time, which would be exact but is read
 * per-platform (`/proc/<pid>/stat`, `ps -o lstart`). The tradeoff it accepts: `Date.now() - os.uptime()`
 * moves with the wall clock, so a forward clock step larger than the uptime at which a record was written
 * makes it look pre-boot. That needs an NTP step of hours shortly after boot while a holder is live, against
 * a recycled pid blocking the app on every reboot, which is certain rather than rare.
 */
export function writerIsRunning(pid: number, writtenAtMs: number): boolean {
  return processIsRunning(pid) && writtenAtMs >= bootTime();
}
