// findRunningApp: an app runs on a data dir when its API's port file names a port that answers, or a live process
// holds the Electron instance lock; stale files don't count
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { API_HOST } from '@abuddy/sdk/env';
import { findRunningApp } from '../../src/database/running.ts';
import { removeTempDirs, tempDir } from './fixtures.ts';

const servers: net.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  removeTempDirs();
});

function context() {
  const userDataDir = tempDir('running-app-');
  return { userDataDir, apiPortFile: path.join(userDataDir, 'api-port') };
}

/** A port something listens on, on the API's interface */
async function listeningPort(): Promise<number> {
  const server = net.createServer();
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, API_HOST, resolve));
  return (server.address() as net.AddressInfo).port;
}

/** A pid no process has any more */
function exitedPid(): number {
  return spawnSync(process.execPath, ['-e', '']).pid!;
}

const lock = (dir: string, target: string) => fs.symlinkSync(target, path.join(dir, 'SingletonLock'));

describe('findRunningApp', () => {
  it('finds nothing in a data dir with neither file', async () => {
    expect(await findRunningApp(context())).toBeNull();
  });

  it("counts a port file whose port answers, and not one whose port doesn't", async () => {
    const live = context();
    const port = await listeningPort();
    fs.writeFileSync(live.apiPortFile, `${port}\n`);
    expect(await findRunningApp(live)).toBe(`its API answers on port ${port} (${live.apiPortFile})`);

    const stale = context();
    const closed = await listeningPort();
    await new Promise((resolve) => servers.pop()!.close(resolve));
    fs.writeFileSync(stale.apiPortFile, String(closed));
    expect(await findRunningApp(stale)).toBeNull();

    const garbled = context();
    fs.writeFileSync(garbled.apiPortFile, 'not a port');
    expect(await findRunningApp(garbled)).toBeNull();
  });

  it('counts a lock a live process holds, and not one an exited process left', async () => {
    const live = context();
    lock(live.userDataDir, `${os.hostname()}-${process.pid}`);
    expect(await findRunningApp(live)).toMatch(new RegExp(`process ${process.pid} holds .*SingletonLock`));

    const stale = context();
    lock(stale.userDataDir, `${os.hostname()}-${exitedPid()}`);
    expect(await findRunningApp(stale)).toBeNull();
  });

  it("counts a lock it can't check: another host's, or one it can't read", async () => {
    const remote = context();
    lock(remote.userDataDir, `another-host.local-${process.pid}`);
    expect(await findRunningApp(remote)).toMatch(/held by a process on another-host\.local/);

    const unreadable = context();
    lock(unreadable.userDataDir, 'garbage');
    expect(await findRunningApp(unreadable)).toMatch(/SingletonLock is held \(garbage\)/);
  });
});
