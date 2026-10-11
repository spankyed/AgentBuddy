/**
 * The app's log files on disk, and the cap that keeps them from taking the machine with them.
 *
 * electron-log rotates its own `main.log` at 10 MB, but the app appends four more files beside it —
 * `app-events.log` and `main.jsonl` from the API and main processes, `renderer.jsonl` and `renderer.log`
 * from the renderer — and those went through a plain `appendFileSync` with no limit at all. They grow for
 * as long as the app is ever run: one machine reached 23 GB in the test environment and 900 MB in the
 * installed app.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** What one log file may reach before it is rotated, matching electron-log's own `main.log`. */
export const LOG_FILE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Appends `line` to `<dir>/<name>`, rotating the file to `<name>.old` once it passes `maxBytes`.
 *
 * One generation is kept, as electron-log keeps one: enough to read back what led to a crash, and bounded
 * at twice the cap however long the app runs. The size is read on each append rather than remembered,
 * because two processes write into this directory and neither can see the other's writes.
 *
 * Never throws. Logging must not break the thing it is logging about.
 */
export function appendCappedLine(dir: string, name: string, line: string, maxBytes = LOG_FILE_MAX_BYTES): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name);
    if ((fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0) >= maxBytes) {
      // Replaces any previous generation, on every platform Node supports
      fs.renameSync(file, `${file}.old`);
    }
    fs.appendFileSync(file, line);
  } catch {
    // A log that can't be written is not worth an error the user sees
  }
}
