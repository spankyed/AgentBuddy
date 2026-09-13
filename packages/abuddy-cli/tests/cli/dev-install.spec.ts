import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const installPackFromLocal = vi.fn(async () => ({ dir: '/installed', missingDependencies: [] }));
vi.mock('@abuddy/host/packs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@abuddy/host/packs')>()),
  installPackFromLocal,
}));

let userDataDir: string;
vi.mock('@abuddy/sdk/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@abuddy/sdk/env')>()),
  resolveAppContext: () => ({ env: 'development', userDataDir, packsDir: path.join(userDataDir, 'packs') }),
}));

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-install-'));
  installPackFromLocal.mockClear();
});
afterEach(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

describe('abuddy dev', () => {
  it("installs with the version of the dev app that last used the data dir, so hostVersion is checked", async () => {
    const { recordHostVersion } = await import('@abuddy/host/packs');
    recordHostVersion(userDataDir, '0.9.1');
    const { installToDev } = await import('../../src/commands/dev');

    await installToDev('/pack');

    expect(installPackFromLocal).toHaveBeenCalledWith('/pack', path.join(userDataDir, 'packs'), { hostVersion: '0.9.1' });
  });

  it('reads the version at each install, as the dev app may start in between', async () => {
    const { recordHostVersion } = await import('@abuddy/host/packs');
    const { installToDev } = await import('../../src/commands/dev');
    await installToDev('/pack');
    recordHostVersion(userDataDir, '1.0.0');
    await installToDev('/pack');

    expect(installPackFromLocal.mock.calls.map((call) => (call as unknown[])[2])).toEqual([{ hostVersion: undefined }, { hostVersion: '1.0.0' }]);
  });
});
