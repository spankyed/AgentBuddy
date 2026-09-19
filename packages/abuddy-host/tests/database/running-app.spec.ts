// findRunningApp: an app runs on a data dir when its API's port file names a port that answers, or a live process
// holds the Electron instance lock; stale files don't count
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { findRunningApp } from '../../src/database/running.ts';
import { removeTempDirs, tempDir } from './fixtures.ts';

afterEach(removeTempDirs);

function context() {
  const userDataDir = tempDir('running-app-');
  return { userDataDir, apiPortFile: path.join(userDataDir, 'api-port') };
}

/** What a running API publishes: its port and its process */
function publishApi(dir: string, { port = 3001, pid = process.pid } = {}): void {
  fs.writeFileSync(path.join(dir, 'api-port'), JSON.stringify({ port, pid }));
}

/** A pid no process has any more */
function exitedPid(): number {
  return spawnSync(process.execPath, ['-e', '']).pid!;
}

const lock = (dir: string, target: string) => fs.symlinkSync(target, path.join(dir, 'SingletonLock'));

/** Backdate a file to before this machine booted, as a previous boot's leftover would be */
function backdateToPreviousBoot(file: string): void {
  const before = new Date(Date.now() - os.uptime() * 1000 - 60_000);
  fs.lutimesSync(file, before, before);
}

describe('findRunningApp', () => {
  it('finds nothing in a data dir with neither file', () => {
    expect(findRunningApp(context())).toBeNull();
  });

  it('counts a port file whose API process is running', () => {
    const live = context();
    publishApi(live.userDataDir, { port: 3001 });
    expect(findRunningApp(live)).toBe(`its API is running on port 3001 (pid ${process.pid})`);
  });

  it("doesn't count a port file a crashed run left behind, or one it can't read", () => {
    const crashed = context();
    publishApi(crashed.userDataDir, { pid: exitedPid() });
    expect(findRunningApp(crashed)).toBeNull();

    for (const content of ['not json', '3001', JSON.stringify({ port: 3001 }), JSON.stringify({ port: 'x', pid: process.pid })]) {
      const garbled = context();
      fs.writeFileSync(garbled.apiPortFile, content);
      expect(findRunningApp(garbled), content).toBeNull();
    }
  });

  it('counts a lock a live process holds, and not one an exited process left', () => {
    const live = context();
    lock(live.userDataDir, `${os.hostname()}-${process.pid}`);
    expect(findRunningApp(live)).toMatch(new RegExp(`process ${process.pid} holds .*SingletonLock`));

    const stale = context();
    lock(stale.userDataDir, `${os.hostname()}-${exitedPid()}`);
    expect(findRunningApp(stale)).toBeNull();
  });

  it("counts a lock it can't check: another host's, or one it can't read", () => {
    const remote = context();
    lock(remote.userDataDir, `another-host.local-${process.pid}`);
    expect(findRunningApp(remote)).toMatch(/held by a process on another-host\.local/);

    const unreadable = context();
    lock(unreadable.userDataDir, 'garbage');
    expect(findRunningApp(unreadable)).toMatch(/SingletonLock is held \(garbage\)/);
  });
});

// `readApiEndpoint` bounds its answer by the boot that wrote the port file, where a wrong "nothing is
// running" costs a connection error to a dead port. The instance lock does not: there a wrong answer lets a
// tool write while the app has the database open, so its pid is taken at face value.
describe('findRunningApp, on a port file left by a previous boot', () => {
  it('ignores a port file that predates this boot, whatever pid it names', () => {
    const ctx = context();
    publishApi(ctx.userDataDir);
    expect(findRunningApp(ctx)).toMatch(/its API is running on port 3001/);

    backdateToPreviousBoot(ctx.apiPortFile);
    expect(findRunningApp(ctx)).toBeNull();
  });

});
