// Files only the user can read, replaced whole: a crash mid-write leaves the previous file (and a leftover temporary one
// the next write replaces). The mode has no effect on Windows, where the file relies on the user profile's ACLs.
import * as fs from 'node:fs';
import * as path from 'node:path';

export function writePrivateFile(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  const fd = fs.openSync(temporary, 'w', 0o600);
  try {
    fs.writeSync(fd, contents);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, filePath);
}
