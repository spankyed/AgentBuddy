import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerHostModule } from '@abuddy/sdk/runtime';
import { prepareHostDataDirs, recoverStagingDirs, stagingDirName } from '../../src/packs/staging.ts';
import { discoverPacks, reconcileExternalRegistry } from '../../src/packs/pack-discovery.ts';
import { readPackRegistry, writePackRegistry } from '../../src/packs/pack-registry.ts';
import { readHostVersion } from '../../src/packs/host-info.ts';

const noop = () => {};
registerHostModule('logger', { createLogger: () => ({ debug: noop, info: noop, warn: noop, error: noop }), LogEvent: {} });

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
    writePackRegistry([{ id: 'demo-pack', name: 'Demo', version: '1.0.0', dir: path.join(packsDir, 'demo-pack'), enabled: true, registeredAt: '' }]);
    // The crash: the old copy moved aside, the new one never placed
    fs.renameSync(path.join(packsDir, 'demo-pack'), path.join(packsDir, `.demo-pack.previous-${exitedPid()}-1a2b3c4d`));
    mkdir(`.demo-pack.installing-${exitedPid()}-x1Y2z3`);

    expect(recoverStagingDirs(packsDir)).toMatchObject({ restored: ['demo-pack'], failed: [] });
    expect(remaining()).toEqual(['demo-pack']);
    const enabled = reconcileExternalRegistry(discoverPacks(packsDir));
    expect(enabled.map((p) => p.manifest.id)).toEqual(['demo-pack']);
    expect(readPackRegistry()).toMatchObject([{ id: 'demo-pack', enabled: true }]);
  });

  it('applies the age rule to legacy names, reading no PID from a random suffix', () => {
    mkdir('.old-pack.installing-Xy12Zw');
    mkdir('.new-pack.installing-1AbCdE');
    mkdir('.fresh-pack.installing-99999x');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(path.join(packsDir, '.old-pack.installing-Xy12Zw'), twoHoursAgo, twoHoursAgo);

    expect(recoverStagingDirs(packsDir).removed).toEqual(['.old-pack.installing-Xy12Zw']);
    expect(remaining()).toEqual(['.fresh-pack.installing-99999x', '.new-pack.installing-1AbCdE']);
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

    expect(() => prepareHostDataDirs({ userDataDir: path.join(packsDir, 'unwritable'), packsDirs: [packsDir, path.join(root, 'not-a-dir.txt')], version: '1.0.0' }, log)).not.toThrow();
    expect(log.warn.mock.calls.flat().join('\n')).toMatch(/Could not record the host version[\s\S]*Could not clean up \.demo-pack\.installing-/);
  });

  it('records the host version atomically', () => {
    prepareHostDataDirs({ userDataDir: root, packsDirs: [packsDir], version: '2.1.0' }, { info: vi.fn(), warn: vi.fn() });
    expect(readHostVersion(root)).toBe('2.1.0');
    expect(fs.readdirSync(root).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});
