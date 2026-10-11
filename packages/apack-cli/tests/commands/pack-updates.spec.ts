import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it, vi } from 'vitest';
import { resolveAppContext } from '@apackdev/sdk/env';
import { recordHostInfo, readInstalledPacks } from '@apackdev/host/packs';
import { recordCliInstall } from '../../src/app/installed-packs';
import { packUpdates } from '../../src/commands/pack-outdated';

it('checks recorded sources against the explicit host and leaves records untouched', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-updates-'));
  try {
    const context = resolveAppContext({ env: 'beta', userDataDir: root });
    for (const id of ['remote', 'local']) {
      const dir = path.join(context.packsDir, id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'apack.json'), JSON.stringify({ id, name: id, version: '1.0.0', features: {} }));
    }
    recordCliInstall(context.installedPacksFile, 'remote', 'owner/repo@v1.0.0');
    recordHostInfo(root, { version: '0.4.0', packFormat: 1 });
    const before = fs.readFileSync(context.installedPacksFile, 'utf8');
    const find = vi.fn().mockResolvedValue({ version: '1.1.0', tag: 'v1.1.0' });
    expect(await packUpdates(context, find)).toMatchObject([{ id: 'local', status: 'unmanaged' }, { id: 'remote', status: 'outdated' }]);
    expect(find).toHaveBeenCalledWith('owner/repo@v1.0.0', { hostVersion: '0.4.0', installedVersion: '1.0.0', includePrerelease: true });
    expect(fs.readFileSync(context.installedPacksFile, 'utf8')).toBe(before);
    find.mockRejectedValue(new Error('rate limited'));
    expect((await packUpdates(context, find))[1]).toMatchObject({ status: 'error', reason: 'rate limited' });
    fs.writeFileSync(context.installedPacksFile, '{broken');
    expect(() => readInstalledPacks(context.installedPacksFile, { strict: true })).toThrow('Cannot read');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
