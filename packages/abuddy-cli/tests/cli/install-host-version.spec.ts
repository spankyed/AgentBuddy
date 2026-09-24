import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordHostInfo } from '@abuddy/host/packs';
import { install } from '../../src/commands/install';
import { PACK_SNAPSHOT_FORMAT } from '@abuddy/sdk/build';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'install-host-version-'));
  vi.stubEnv('ABUDDY_USER_DATA_DIR', path.join(tmp, 'data'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A pack dir as `abuddy build` leaves it. */
function builtPack(hostVersion: string): string {
  const root = path.join(tmp, 'pack');
  const write = (rel: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  };
  write('abuddy.json', JSON.stringify({ id: 'demo-pack', name: 'Demo Pack', version: '1.0.0', hostVersion }));
  write('dist/runtime/index.cjs', 'module.exports = { registration: { id: "demo-pack" } };');
  write('dist/types/snapshot.json', JSON.stringify({ types: {}, format: PACK_SNAPSHOT_FORMAT }));
  return root;
}

describe('abuddy install', () => {
  it("refuses a pack whose hostVersion the data dir's AgentBuddy doesn't satisfy", async () => {
    recordHostInfo(path.join(tmp, 'data'), { version: '0.3.14', packFormat: PACK_SNAPSHOT_FORMAT });
    await expect(install([builtPack('>=99.0.0'), '--dev'])).rejects.toThrow('requires AgentBuddy >=99.0.0; this is 0.3.14');
  });

  it("installs when the data dir's AgentBuddy satisfies it", async () => {
    recordHostInfo(path.join(tmp, 'data'), { version: '0.3.14', packFormat: PACK_SNAPSHOT_FORMAT });
    await install([builtPack('>=0.3.0'), '--dev']);
    expect(fs.existsSync(path.join(tmp, 'data', 'packs', 'demo-pack', 'abuddy.json'))).toBe(true);
  });

  // The app records the pack format it reads, which need not be the one this CLI builds
  it("refuses a pack built in a format other than the data dir's AgentBuddy reads", async () => {
    recordHostInfo(path.join(tmp, 'data'), { version: '0.3.14', packFormat: PACK_SNAPSHOT_FORMAT + 1 });
    await expect(install([builtPack('>=0.3.0'), '--dev'])).rejects.toThrow(
      `Pack "demo-pack" can't be installed: its snapshot is format ${PACK_SNAPSHOT_FORMAT}, written by an older abuddy CLI; this AgentBuddy reads format ${PACK_SNAPSHOT_FORMAT + 1}`,
    );
    expect(fs.existsSync(path.join(tmp, 'data', 'packs', 'demo-pack'))).toBe(false);
  });

  it("notes that hostVersion wasn't checked before the app has used the data dir", async () => {
    await install([builtPack('>=99.0.0'), '--dev']);
    expect(vi.mocked(console.warn).mock.calls.flat().join('\n')).toContain("hostVersion wasn't checked");
  });
});

// Tooling runs host code with no app bound: @abuddy/host/packs logs through @abuddy/sdk/logger, which writes to the console
describe('the abuddy bin', () => {
  it('installs a pack, printing what @abuddy/host/packs logs', () => {
    const cli = path.resolve(__dirname, '..', '..', 'bin', 'abuddy.mjs');
    const result = spawnSync(process.execPath, [cli, 'install', builtPack('>=0.3.0'), '--dev'], {
      cwd: tmp,
      encoding: 'utf-8',
      env: { ...process.env, ABUDDY_USER_DATA_DIR: path.join(tmp, 'data'), NO_COLOR: '1', FORCE_COLOR: '0' },
      timeout: 60_000,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('[pack-installer] Installed "Demo Pack" v1.0.0');
    expect(fs.existsSync(path.join(tmp, 'data', 'packs', 'demo-pack', 'abuddy.json'))).toBe(true);
  }, 60_000);
});
