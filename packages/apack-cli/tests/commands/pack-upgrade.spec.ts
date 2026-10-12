import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it, vi } from 'vitest';
import { resolveAppEnvironment } from '@apackdev/sdk/env';
import { recordHostCompatibility, readInstalledPacks, writeInstalledPacks, type installPackFromGitHub } from '@apackdev/host/packs';
import { findDatabaseWriter, publishRunningApp } from '@apackdev/host/database';
import { recordCliInstall } from '../../src/app/installed-packs';
import { upgradePack } from '../../src/commands/pack-upgrade';

it('pins the selected tag, validates before replacement, and records only a successful upgrade', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-upgrade-'));
  try {
    const context = resolveAppEnvironment({ env: 'production', userDataDir: root });
    const dir = path.join(context.packsDir, 'demo');
    fs.mkdirSync(dir, { recursive: true });
    const manifest = { id: 'demo', name: 'Demo', version: '1.0.0', features: {} };
    fs.writeFileSync(path.join(dir, 'apack.json'), JSON.stringify(manifest));
    recordHostCompatibility(root, { version: '0.4.0', packFormat: 1 });
    recordCliInstall(context.installedPacksFile, 'demo', 'owner/repo@v1.0.0');
    const find = vi.fn().mockResolvedValue({ version: '1.1.0', tag: 'release-1.1' });
    let incoming = { ...manifest, version: '1.1.0' };
    const install: typeof installPackFromGitHub = vi.fn(async (_source, _dir, options) => {
      options?.beforePlace?.(incoming);
      fs.writeFileSync(path.join(dir, 'apack.json'), JSON.stringify(incoming));
      return { id: 'demo', name: 'Demo', version: incoming.version, dir, missingDependencies: [], integrity: { formatVersion: 1, id: 'demo', version: incoming.version, files: {} } };
    });
    incoming = { ...incoming, id: 'wrong' };
    await expect(upgradePack(context, 'demo', { find, install })).rejects.toThrow('Expected external pack');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'apack.json'), 'utf8')).version).toBe('1.0.0');
    expect(findDatabaseWriter(root)).toBeNull();
    incoming = { ...incoming, id: 'demo' };
    const running = publishRunningApp(root);
    try { await expect(upgradePack(context, 'demo', { find, install })).rejects.toThrow('Quit the app'); }
    finally { running(); }
    const incompatible = vi.fn(async (_source, _dir, options) => {
      options?.beforePlace?.({ ...incoming, dependencies: { missing: '^1.0.0' } });
      throw new Error('must not reach placement');
    }) as typeof installPackFromGitHub;
    await expect(upgradePack(context, 'demo', { find, install: incompatible })).rejects.toThrow('Install a compatible missing');
    const dependentDir = path.join(context.packsDir, 'dependent');
    fs.mkdirSync(dependentDir);
    fs.writeFileSync(path.join(dependentDir, 'apack.json'), JSON.stringify({
      id: 'dependent', name: 'Dependent', version: '1.0.0', features: {}, dependencies: { demo: '~1.0.0' },
    }));
    await expect(upgradePack(context, 'demo', { find, install })).rejects.toThrow('dependent requires demo ~1.0.0');
    fs.rmSync(dependentDir, { recursive: true });
    const disabledDir = path.join(context.packsDir, 'disabled');
    fs.mkdirSync(disabledDir);
    fs.writeFileSync(path.join(disabledDir, 'apack.json'), JSON.stringify({ id: 'disabled', name: 'Disabled', version: '1.0.0', features: {} }));
    writeInstalledPacks([...readInstalledPacks(context.installedPacksFile), { id: 'disabled', enabled: false }], context.installedPacksFile);
    const needsDisabled = vi.fn(async (_source, _dir, options) => {
      options?.beforePlace?.({ ...incoming, dependencies: { disabled: '^1.0.0' } });
      throw new Error('must not reach placement');
    }) as typeof installPackFromGitHub;
    await expect(upgradePack(context, 'demo', { find, install: needsDisabled })).rejects.toThrow('Install a compatible disabled');
    expect(await upgradePack(context, 'demo', { find, install })).toEqual({ id: 'demo', version: '1.1.0', upgraded: true });
    expect(install).toHaveBeenLastCalledWith('owner/repo@release-1.1', context.packsDir, expect.objectContaining({ hostVersion: '0.4.0', packFormat: 1 }));
    expect(readInstalledPacks(context.installedPacksFile).find(record => record.id === 'demo')?.installedFrom).toBe('owner/repo@release-1.1');
    find.mockResolvedValue(null);
    expect(await upgradePack(context, 'demo', { find, install })).toMatchObject({ upgraded: false });
    await expect(upgradePack(context, '../demo', { find, install })).rejects.toThrow('valid installed pack ID');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
