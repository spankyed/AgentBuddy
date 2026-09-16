// Files only the user can read, replaced whole: a crash mid-write leaves the previous file (and a leftover temporary
// one). The mode has no effect on Windows, where the file relies on the user profile's ACLs.
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const isWindows = () => process.platform === 'win32';

/** Errors Windows gives a rename while another process (an antivirus, an indexer) briefly holds the file */
const TRANSIENT_RENAME_ERRORS = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_ATTEMPTS = 10;

const errorCode = (error: unknown) => (error as NodeJS.ErrnoException | undefined)?.code;

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function rename(from: string, to: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      if (!isWindows() || attempt === RENAME_ATTEMPTS || !TRANSIENT_RENAME_ERRORS.has(errorCode(error) ?? '')) throw error;
      sleepSync(attempt * 10);
    }
  }
}

/** Makes the rename itself durable; Windows can't open a directory to sync it */
function syncDirectory(dir: string): void {
  if (isWindows()) return;
  const fd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(fd);
  } catch (error) {
    // File systems that can't sync a directory
    if (errorCode(error) !== 'EINVAL' && errorCode(error) !== 'ENOTSUP') throw error;
  } finally {
    fs.closeSync(fd);
  }
}

export function writePrivateFile(filePath: string, contents: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  // Unique per write, so concurrent writers never share one
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeSync(fd, contents);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    rename(temporary, filePath);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
  syncDirectory(dir);
}
