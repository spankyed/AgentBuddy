import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareHostDataDirs, recoverStagingDirs, stagingDirName } from '../../src/packs/staging.ts';
import { discoverPacks, enabledExternalPacks } from '../../src/packs/discovery.ts';
import { readInstalledPacks, writeInstalledPacks } from '../../src/packs/installed.ts';

const recordedPacks = () => readInstalledPacks();

import { readHostInfo } from '../../src/packs/host-info.ts';
import { PACK_SNAPSHOT_FORMAT } from '@abuddy/sdk/build';


let root: string;
let packsDir: string;
const env = { ABUDDY_ENV: process.env.ABUDDY_ENV, ABUDDY_USER_DATA_DIR: process.env.ABUDDY_USER_DATA_DIR };
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-'));
  process.env.ABUDDY_ENV = 'test';
  process.env.ABUDDY_USER_DATA_DIR = root;
  packsDir = path.join(root, 'packs');
  fs.mkdirSync(packsDir);
});
afterEach(() => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.chmodSync(packsDir, 0o755);
  fs.rmSync(root, { recursive: true, force: true });
});

const exitedPid = () => spawnSync(process.execPath, ['-e', '']).pid!;
const mkdir = (name: string) => fs.mkdirSync(path.join(packsDir, name));
const remaining = () => fs.readdirSync(packsDir).sort();

function writePack(name: string, id = 'demo-pack'): void {
  fs.mkdirSync(path.join(packsDir, name), { recursive: true });
  fs.writeFileSync(path.join(packsDir, name, 'abuddy.json'), JSON.stringify({ id, name: 'Demo', version: '1.0.0' }));
}

describe('recoverStagingDirs', () => {
  it("removes staging dirs whose process is gone and keeps another process's install in progress", () => {
    const exited = exitedPid();
    const running = process.ppid;
    mkdir('demo-pack');
    mkdir(`.demo-pack.installing-${exited}-a1B2c3`);
    mkdir(`.demo-pack.previous-${exited}-9f8e7d6c`);
    mkdir(`.base-pack.publishing-${exited}`);
    mkdir(`.other-pack.installing-${running}-d4E5f6`);
    mkdir(`.other-pack.previous-${process.pid}-0a1b2c3d`);

    const result = recoverStagingDirs(packsDir);
    expect(result.removed.sort()).toEqual([
      `.base-pack.publishing-${exited}`,
      `.demo-pack.installing-${exited}-a1B2c3`,
      `.demo-pack.previous-${exited}-9f8e7d6c`,
    ]);
    expect(result.restored).toEqual([]);
    expect(remaining()).toEqual([`.other-pack.installing-${running}-d4E5f6`, `.other-pack.previous-${process.pid}-0a1b2c3d`, 'demo-pack'].sort());
  });

  it('restores a pack whose install crashed between moving it aside and placing the new copy, and keeps it enabled', () => {
    writePack('demo-pack');
    writeInstalledPacks([{ id: 'demo-pack', enabled: true }]);
    // The crash: the old copy moved aside, the new one never placed
    fs.renameSync(path.join(packsDir, 'demo-pack'), path.join(packsDir, `.demo-pack.previous-${exitedPid()}-1a2b3c4d`));
    mkdir(`.demo-pack.installing-${exitedPid()}-x1Y2z3`);

    expect(recoverStagingDirs(packsDir)).toMatchObject({ restored: ['demo-pack'], failed: [] });
    expect(remaining()).toEqual(['demo-pack']);
    expect(enabledExternalPacks(discoverPacks(packsDir), new Set()).map((p) => p.manifest.id)).toEqual(['demo-pack']);
    expect(recordedPacks()).toMatchObject([{ id: 'demo-pack', enabled: true }]);
  });

  it('leaves a directory whose name carries no process id', () => {
    mkdir('.other-pack.installing-Xy12Zw');

    expect(recoverStagingDirs(packsDir)).toMatchObject({ restored: [], removed: [], failed: [] });
    expect(remaining()).toEqual(['.other-pack.installing-Xy12Zw']);
  });

  it("treats a dir written before this boot as stale, whatever process holds its id now", () => {
    // A crashed install's dir whose PID a running process now has: only its age says the install is gone
    const reused = process.ppid;
    mkdir(`.demo-pack.installing-${reused}-a1B2c3`);
    const beforeBoot = new Date(Date.now() - os.uptime() * 1000 - 60_000);
    fs.utimesSync(path.join(packsDir, `.demo-pack.installing-${reused}-a1B2c3`), beforeBoot, beforeBoot);

    expect(recoverStagingDirs(packsDir)).toMatchObject({ removed: [`.demo-pack.installing-${reused}-a1B2c3`], failed: [] });
    expect(remaining()).toEqual([]);
  });

  // Only placePack makes a `.previous`, and it removes it on success and on a failed rename, so one that
  // survives means an install died part-way. What the app has recorded cannot change that: an uninstall
  // needs the pack's directory to be there, and the interrupted install moved it aside.
  it("restores an interrupted install's copy whatever the record says about the pack", () => {
    writePack(`.demo-pack.previous-${exitedPid()}-1a2b3c4d`);
    writeInstalledPacks([]);

    expect(recoverStagingDirs(packsDir)).toMatchObject({ restored: ['demo-pack'], failed: [] });
    expect(remaining()).toEqual(['demo-pack']);
  });

  // Deleting an interrupted install's only copy is the bug this function exists to avoid; it once did
  // exactly that, on the first boot after installed-packs.json was renamed away.
  it('restores every interrupted install when there is no record of what is installed', () => {
    writePack(`.demo-pack.previous-${exitedPid()}-1a2b3c4d`);
    expect(fs.existsSync(path.join(root, 'installed-packs.json'))).toBe(false);

    prepareHostDataDirs({ userDataDir: root, packsDir, version: '0.3.14' });

    expect(remaining()).toEqual(['demo-pack']);
  });

  it('restores every interrupted install when the record cannot be parsed', () => {
    writePack(`.demo-pack.previous-${exitedPid()}-1a2b3c4d`);
    fs.writeFileSync(path.join(root, 'installed-packs.json'), 'not json');

    prepareHostDataDirs({ userDataDir: root, packsDir, version: '0.3.14' });

    expect(remaining()).toEqual(['demo-pack']);
  });

  it('ignores a packs dir that does not exist yet', () => {
    expect(recoverStagingDirs(path.join(packsDir, 'missing'))).toEqual({ restored: [], removed: [], failed: [] });
  });

  it('names staging dirs uniquely per process and call, in the owned format', () => {
    const name = stagingDirName('demo-pack', 'previous');
    expect(name).toMatch(new RegExp(`^\\.demo-pack\\.previous-${process.pid}-[0-9a-f]{8}$`));
    expect(stagingDirName('demo-pack', 'previous')).not.toBe(name);
  });
});

describe('prepareHostDataDirs', () => {
  it('logs instead of failing when staging dirs or host.json cannot be written', () => {
    const staging = `.demo-pack.installing-${exitedPid()}-a1B2c3`;
    mkdir(staging);
    fs.writeFileSync(path.join(packsDir, staging, 'file'), '');
    fs.chmodSync(packsDir, 0o555);
    const log = { info: vi.fn(), warn: vi.fn() };

    expect(() => prepareHostDataDirs({ userDataDir: path.join(packsDir, 'unwritable'), packsDir, hostPacksDir: path.join(root, 'not-a-dir.txt'), version: '1.0.0' }, log)).not.toThrow();
    expect(log.warn.mock.calls.flat().join('\n')).toMatch(/Could not record the host version[\s\S]*Could not clean up \.demo-pack\.installing-/);
  });

  it('records the host version and the pack format it reads, atomically', () => {
    prepareHostDataDirs({ userDataDir: root, packsDir, version: '2.1.0' }, { info: vi.fn(), warn: vi.fn() });
    expect(readHostInfo(root)).toEqual({ version: '2.1.0', packFormat: PACK_SNAPSHOT_FORMAT });
    expect(fs.readdirSync(root).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});
