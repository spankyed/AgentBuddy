// The lock a tool holds while it changes a data dir's database, which an app checks before it opens the same one
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
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

/** The module under test, loaded by a child process that holds a real lock and waits to be signalled */
const SRC = path.resolve(import.meta.dirname, '../../src/database/write-lock.ts');
/** The child is plain node, so it needs the TypeScript loader this suite already runs under */
const TSX = createRequire(import.meta.url).resolve('tsx/esm');
// `node -e` has no script slot, so the arguments start at argv[1]
const HOLD_UNTIL_SIGNALLED =
  "const [, dir, src] = process.argv;" +
  "import(src).then(({ holdDatabaseWriteLock }) => { holdDatabaseWriteLock(dir, 'abuddy db import'); setInterval(() => {}, 1000); });";

/** Polls until `done`, or fails naming what it was waiting for rather than leaving that to the assertion */
async function waitFor(what: string, done: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() >= deadline) throw new Error(`Timed out after ${timeoutMs}ms waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}
/** A pid no process has any more */
const exitedPid = () => spawnSync(process.execPath, ['-e', '']).pid!;

describe('the database write lock', () => {
  it('stops listening for the process exiting once it is released', () => {
    const dir = tempDir('write-lock-');
    const before = process.listenerCount('exit');
    const lock = hold(dir);
    expect(process.listenerCount('exit')).toBe(before + 1);
    lock.release();
    lock.release();
    expect(process.listenerCount('exit')).toBe(before);
  });

  it('is free in a data dir no tool is changing', () => {
    const dir = tempDir('write-lock-');
    expect(findDatabaseWriter(dir)).toBeNull();
    expect(() => assertNoDatabaseWriter(dir)).not.toThrow();
  });

  it('names the tool holding it, and is gone once released', () => {
    const dir = tempDir('write-lock-');
    const lock = hold(dir);
    expect(findDatabaseWriter(dir)).toBe(`abuddy db reset (pid ${process.pid})`);
    // A lock a killed tool left, whose pid something else now has, would otherwise leave no way forward
    expect(() => assertNoDatabaseWriter(dir)).toThrow(
      `The database in ${dir} is being changed by abuddy db reset (pid ${process.pid}). Wait for it to finish, then start ` +
      `AgentBuddy again. If no tool is running, delete ${lockFile(dir)} and try again.`,
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
    fs.writeFileSync(lockFile(dir), JSON.stringify({ pid: process.ppid, machine: os.hostname(), what: 'another tool' }));
    lock.release();
    expect(findDatabaseWriter(dir)).toBe(`another tool (pid ${process.ppid})`);
  });

  it('refuses a second tool while it is held', () => {
    const dir = tempDir('write-lock-');
    hold(dir, 'abuddy db import');
    expect(() => holdDatabaseWriteLock(dir, 'abuddy db exec')).toThrow(
      `Another tool is changing the database in ${dir}: abuddy db import (pid ${process.pid}). If no tool is running, ` +
      `delete ${lockFile(dir)} and try again.`,
    );
  });

  it('takes over a lock whose process has exited', () => {
    const dir = tempDir('write-lock-');
    fs.writeFileSync(lockFile(dir), JSON.stringify({ pid: exitedPid(), machine: os.hostname(), what: 'a tool that died' }));
    expect(findDatabaseWriter(dir)).toBeNull();
    hold(dir);
    expect(findDatabaseWriter(dir)).toBe(`abuddy db reset (pid ${process.pid})`);
  });

  it('refuses a lock it cannot read, which is one missing what would resolve it', () => {
    for (const body of ['not json', JSON.stringify({ machine: os.hostname(), what: 'a tool' }), JSON.stringify({ pid: 1, what: 'a tool' })]) {
      const unreadable = tempDir('write-lock-');
      fs.writeFileSync(lockFile(unreadable), body);
      expect(findDatabaseWriter(unreadable)).toBe("a tool whose lock can't be read");
      expect(() => holdDatabaseWriteLock(unreadable, 'abuddy db reset')).toThrow(
        `Another tool is changing the database in ${unreadable}: a tool whose lock can't be read. If no tool is running, delete ${lockFile(unreadable)} and try again.`,
      );
    }
  });

  // Node runs no `exit` handler for a signal, so without the interrupt handlers Ctrl-C on any `abuddy db`
  // command left the lock behind and the next reader had to work out that its holder was gone. Only SIGKILL
  // can still do that, and nothing can catch it.
  it.each(['SIGINT', 'SIGTERM', 'SIGHUP'] as const)('releases the lock when the tool is interrupted with %s', async (signal) => {
    const dir = tempDir('write-lock-');
    const holder = spawn(process.execPath, ['--import', pathToFileURL(TSX).href, '-e', HOLD_UNTIL_SIGNALLED, dir, SRC], { stdio: 'ignore' });
    try {
      // The holder compiles this package's source through tsx, which takes seconds when the whole unit
      // suite is running beside it. The release it is asked for afterwards is immediate, and is the
      // thing under test, so only the boot gets the long budget.
      await waitFor('the holder to take the lock', () => fs.existsSync(lockFile(dir)), 60_000);
      process.kill(holder.pid!, signal);
      await waitFor(`the ${signal} handler to release the lock`, () => !fs.existsSync(lockFile(dir)));
    } finally {
      holder.kill('SIGKILL');
    }
    expect(fs.existsSync(lockFile(dir))).toBe(false);
  }, 90_000);

  it("counts a lock from another machine, whose process it can't check", () => {
    const dir = tempDir('write-lock-');
    fs.writeFileSync(lockFile(dir), JSON.stringify({ pid: process.pid, machine: 'another-machine.local', what: 'abuddy db exec' }));
    expect(findDatabaseWriter(dir)).toBe('abuddy db exec on another-machine.local');
  });
});
