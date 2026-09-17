// The lock a tool holds while it changes a data dir's database, which an app checks before it opens the same one
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { assertNoDatabaseWriter, findDatabaseWriter, holdDatabaseWriteLock } from '../../src/database/write-lock.ts';
import { removeTempDirs, tempDir } from './fixtures.ts';

const locks: Array<{ release(): void }> = [];
afterEach(() => {
  for (const lock of locks.splice(0)) lock.release();
  removeTempDirs();
});

const hold = (dir: string, what = 'abuddy db reset') => {
  const lock = holdDatabaseWriteLock(dir, what);
  locks.push(lock);
  return lock;
};

const lockFile = (dir: string) => path.join(dir, 'db-write.lock');
/** A pid no process has any more */
const exitedPid = () => spawnSync(process.execPath, ['-e', '']).pid!;

describe('the database write lock', () => {
  it('is free in a data dir no tool is changing', () => {
    const dir = tempDir('write-lock-');
    expect(findDatabaseWriter(dir)).toBeNull();
    expect(() => assertNoDatabaseWriter(dir)).not.toThrow();
  });

  it('names the tool holding it, and is gone once released', () => {
    const dir = tempDir('write-lock-');
    const lock = hold(dir);
    expect(findDatabaseWriter(dir)).toBe(`abuddy db reset (pid ${process.pid})`);
    expect(() => assertNoDatabaseWriter(dir)).toThrow(
      new RegExp(`The database in ${dir} is being changed by abuddy db reset \\(pid ${process.pid}\\). Wait for it to finish`),
    );
    lock.release();
    expect(findDatabaseWriter(dir)).toBeNull();
    expect(fs.existsSync(lockFile(dir))).toBe(false);
    // Releasing again is harmless
    lock.release();
    expect(findDatabaseWriter(dir)).toBeNull();
  });

  it("releases only its own lock, never the one another tool holds", () => {
    const dir = tempDir('write-lock-');
    const lock = hold(dir);
    // Another tool took the lock over (this one's file was removed by hand, say)
    fs.writeFileSync(lockFile(dir), JSON.stringify({ pid: process.ppid, host: os.hostname(), what: 'another tool' }));
    lock.release();
    expect(findDatabaseWriter(dir)).toBe(`another tool (pid ${process.ppid})`);
  });

  it('refuses a second tool while it is held', () => {
    const dir = tempDir('write-lock-');
    hold(dir, 'abuddy db import');
    expect(() => holdDatabaseWriteLock(dir, 'abuddy db exec')).toThrow(
      `Another tool is changing the database in ${dir}: abuddy db import (pid ${process.pid})`,
    );
  });

  it('takes over a lock whose process has exited, and one that cannot be read', () => {
    const dir = tempDir('write-lock-');
    fs.writeFileSync(lockFile(dir), JSON.stringify({ pid: exitedPid(), host: os.hostname(), what: 'a tool that died' }));
    expect(findDatabaseWriter(dir)).toBeNull();
    hold(dir);
    expect(findDatabaseWriter(dir)).toBe(`abuddy db reset (pid ${process.pid})`);

    const unreadable = tempDir('write-lock-');
    fs.writeFileSync(lockFile(unreadable), 'not json');
    expect(findDatabaseWriter(unreadable)).toBe(`something holds ${lockFile(unreadable)}, which can't be read`);
    expect(() => holdDatabaseWriteLock(unreadable, 'abuddy db reset')).toThrow(/which can't be read/);
  });

  it("counts a lock from another host, whose process it can't check", () => {
    const dir = tempDir('write-lock-');
    fs.writeFileSync(lockFile(dir), JSON.stringify({ pid: process.pid, host: 'another-host.local', what: 'abuddy db exec' }));
    expect(findDatabaseWriter(dir)).toBe(`abuddy db exec on another-host.local holds ${lockFile(dir)}`);
  });
});
