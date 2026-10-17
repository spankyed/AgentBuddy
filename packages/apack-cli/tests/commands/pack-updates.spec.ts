import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it, vi } from 'vitest';
import { resolveAppEnvironment } from '@apackdev/sdk/env';
import { recordHostCompatibility, readInstalledPacks, uninstallPack } from '@apackdev/host/packs';
import { recordCliInstall } from '../../src/app/installed-packs';
import { packUpdates } from '../../src/app/pack-updates';

it('checks recorded sources against the explicit host and leaves records untouched', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-updates-'));
  try {
    const context = resolveAppEnvironment({ env: 'beta', userDataDir: root });
    for (const id of ['remote', 'local']) {
      const dir = path.join(context.packsDir, id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'apack.json'), JSON.stringify({ id, name: id, version: '1.0.0', features: {} }));
    }
    recordCliInstall(context.installedPacksFile, 'remote', 'owner/repo@release/v1.0.0');
    recordHostCompatibility(root, { version: '0.4.0', packFormat: 1 });
    const before = fs.readFileSync(context.installedPacksFile, 'utf8');
    const find = vi.fn().mockResolvedValue({ version: '1.1.0', tag: 'v1.1.0' });
    expect(await packUpdates(context, find)).toMatchObject([{ id: 'local', status: 'unmanaged' }, { id: 'remote', status: 'outdated' }]);
    expect(find).toHaveBeenCalledWith('owner/repo@release/v1.0.0', { hostVersion: '0.4.0', installedVersion: '1.0.0', includePrerelease: true });
    expect(fs.readFileSync(context.installedPacksFile, 'utf8')).toBe(before);
    find.mockRejectedValue(new Error('rate limited'));
    expect((await packUpdates(context, find))[1]).toMatchObject({ status: 'error', reason: 'rate limited' });
    await uninstallPack('remote', context.packsDir, { installedPacksFile: context.installedPacksFile });
    expect(readInstalledPacks(context.installedPacksFile, { strict: true })).toEqual([{ id: 'remote', enabled: true, suppressAppInstall: true }]);
    fs.writeFileSync(context.installedPacksFile, JSON.stringify({ packs: [
      { id: 'remote', enabled: true }, { id: 'remote', enabled: false },
    ] }));
    expect(() => readInstalledPacks(context.installedPacksFile, { strict: true })).toThrow('Duplicate');
    fs.writeFileSync(context.installedPacksFile, JSON.stringify({ packs: [{ id: '../remote' }] }));
    expect(() => readInstalledPacks(context.installedPacksFile, { strict: true })).toThrow('Invalid');
    fs.writeFileSync(context.installedPacksFile, '{broken');
    expect(() => readInstalledPacks(context.installedPacksFile, { strict: true })).toThrow('Cannot read');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


it('uses installation ownership to choose GitHub updates independently of the pack name', async () => {
  const { packUpdate } = await import('../../src/app/pack-updates');
  const find = vi.fn().mockResolvedValue({ version: '1.1.0', tag: 'v1.1.0' });
  const manifest = { id: 'default-setup', name: 'Default setup fork', version: '1.0.0' };
  const record = { id: manifest.id, enabled: true, installedFrom: 'owner/default-fork', updatesWith: 'user' as const };
  const pack = { manifest, record, dir: '/unused' };
  expect(await packUpdate(pack, { hostVersion: '0.4.0', includePrerelease: false }, find))
    .toMatchObject({ status: 'outdated' });
  expect(find).toHaveBeenCalledOnce();
  find.mockClear();
  expect(await packUpdate({ ...pack, record: { ...record, updatesWith: 'app' } },
    { hostVersion: '0.4.0', includePrerelease: false }, find))
    .toMatchObject({ status: 'unmanaged', reason: 'updates with the app' });
  expect(find).not.toHaveBeenCalled();
});
