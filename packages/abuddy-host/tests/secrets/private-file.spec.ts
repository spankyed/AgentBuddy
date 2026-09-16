// Files only the user can read, replaced whole: a failed write leaves the previous file and no temporary one
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Renames fail with `renameFailures.code` for `renameFailures.count` more calls
const renameFailures = vi.hoisted(() => ({ code: '', count: 0 }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: (from: fs.PathLike, to: fs.PathLike) => {
      if (renameFailures.count > 0) {
        renameFailures.count -= 1;
        throw Object.assign(new Error(`${renameFailures.code}: rename failed`), { code: renameFailures.code });
      }
      actual.renameSync(from, to);
    },
  };
});

const { writePrivateFile } = await import('../../src/secrets/private-file.ts');

const platform = process.platform;
const dirs: string[] = [];
afterEach(() => {
  renameFailures.count = 0;
  Object.defineProperty(process, 'platform', { value: platform });
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'private-file-'));
  dirs.push(dir);
  return dir;
}

describe('writePrivateFile', () => {
  it('replaces the file, readable only by the user, leaving no temporary file', () => {
    const file = path.join(tempDir(), 'secrets.json');
    writePrivateFile(file, 'one');
    writePrivateFile(file, 'two');
    expect(fs.readFileSync(file, 'utf-8')).toBe('two');
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(path.dirname(file))).toEqual(['secrets.json']);
  });

  it('keeps the previous file and removes its temporary one when the rename fails', () => {
    const file = path.join(tempDir(), 'secrets.json');
    writePrivateFile(file, 'one');
    renameFailures.code = 'EXDEV';
    renameFailures.count = 1;
    expect(() => writePrivateFile(file, 'two')).toThrow('EXDEV');
    expect(fs.readFileSync(file, 'utf-8')).toBe('one');
    expect(fs.readdirSync(path.dirname(file))).toEqual(['secrets.json']);
  });

  it('retries a rename another process briefly blocks, on Windows only', () => {
    const file = path.join(tempDir(), 'secrets.json');
    renameFailures.code = 'EPERM';
    renameFailures.count = 2;
    expect(() => writePrivateFile(file, 'one')).toThrow('EPERM');
    expect(fs.readdirSync(path.dirname(file))).toEqual([]);

    Object.defineProperty(process, 'platform', { value: 'win32' });
    renameFailures.count = 2;
    writePrivateFile(file, 'one');
    expect(fs.readFileSync(file, 'utf-8')).toBe('one');
    expect(fs.readdirSync(path.dirname(file))).toEqual(['secrets.json']);

    renameFailures.count = 100;
    expect(() => writePrivateFile(file, 'two')).toThrow('EPERM');
    expect(fs.readFileSync(file, 'utf-8')).toBe('one');
    expect(fs.readdirSync(path.dirname(file))).toEqual(['secrets.json']);
  });
});
