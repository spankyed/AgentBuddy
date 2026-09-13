import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordHostVersion } from '@abuddy/host/packs';
import { install } from '../../src/commands/install';

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
  write('dist/runtime/index.cjs', 'module.exports = { registration: { id: "demo-pack", systems: [] } };');
  write('dist/types/snapshot.json', '{"types":{}}');
  return root;
}

describe('abuddy install', () => {
  it("refuses a pack whose hostVersion the data dir's AgentBuddy doesn't satisfy", async () => {
    recordHostVersion(path.join(tmp, 'data'), '0.3.14');
    await expect(install([builtPack('>=99.0.0'), '--dev'])).rejects.toThrow('requires AgentBuddy >=99.0.0; this is 0.3.14');
  });

  it("installs when the data dir's AgentBuddy satisfies it", async () => {
    recordHostVersion(path.join(tmp, 'data'), '0.3.14');
    await install([builtPack('>=0.3.0'), '--dev']);
    expect(fs.existsSync(path.join(tmp, 'data', 'packs', 'demo-pack', 'abuddy.json'))).toBe(true);
  });

  it("notes that hostVersion wasn't checked before the app has used the data dir", async () => {
    await install([builtPack('>=99.0.0'), '--dev']);
    expect(vi.mocked(console.warn).mock.calls.flat().join('\n')).toContain("hostVersion wasn't checked");
  });
});
