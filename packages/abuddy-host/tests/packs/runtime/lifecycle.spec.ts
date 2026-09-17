import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Plugin } from '@abuddy/sdk/fe';

import { registry } from './test-host.ts';
import { createFePackRegistry } from '../../../src/fe/pack-store.ts';

let tmpDir: string;
let origEnv: { env?: string; userDataDir?: string };

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-lifecycle-'));
  origEnv = { env: process.env.ABUDDY_ENV, userDataDir: process.env.ABUDDY_USER_DATA_DIR };
  process.env.ABUDDY_ENV = 'test';
  process.env.ABUDDY_USER_DATA_DIR = tmpDir;
});

afterEach(() => {
  restoreEnv('ABUDDY_ENV', origEnv.env);
  restoreEnv('ABUDDY_USER_DATA_DIR', origEnv.userDataDir);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

const packsDir = () => path.join(tmpDir, 'packs');

/** Writes what `abuddy build` leaves in a pack's dist/: a runtime registering `systemsSource`, and a snapshot */
function writeBuild(packDir: string, id: string, systemsSource = '[]', extraFiles: Record<string, string> = {}) {
  const write = (rel: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(packDir, 'dist', rel)), { recursive: true });
    fs.writeFileSync(path.join(packDir, 'dist', rel), content);
  };
  write('runtime/index.cjs', `module.exports = { registration: { id: ${JSON.stringify(id)}, systems: ${systemsSource} } };`);
  write('types/snapshot.json', '{}');
  for (const [rel, content] of Object.entries(extraFiles)) write(rel, content);
}

function writeManifest(dir: string, manifest: Record<string, unknown>) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'abuddy.json'), JSON.stringify(manifest));
}

describe('pack full lifecycle: install → discover', () => {
  it('update flow: reinstalling overwrites the previous version', async () => {
    const { installPackFromLocal } = await import('../../../src/packs/pack-installer.ts');

    const sourceDir = path.join(tmpDir, 'update-pack');

    // v1
    writeManifest(sourceDir, { id: 'update-pack', name: 'Update Pack', version: '1.0.0' });
    writeBuild(sourceDir, 'update-pack', '[]', { 'runtime/seeds/v1.seed.json': '[]' });

    await installPackFromLocal(sourceDir, packsDir());

    const installedDir = path.join(packsDir(), 'update-pack');
    expect(fs.existsSync(path.join(installedDir, 'runtime', 'seeds', 'v1.seed.json'))).toBe(true);

    // v2: new file, old one removed
    writeManifest(sourceDir, { id: 'update-pack', name: 'Update Pack', version: '2.0.0' });
    fs.rmSync(path.join(sourceDir, 'dist'), { recursive: true });
    writeBuild(sourceDir, 'update-pack', '[]', { 'runtime/seeds/v2.seed.json': '[]' });

    await installPackFromLocal(sourceDir, packsDir());

    // v1 file should be gone (fresh copy)
    expect(fs.existsSync(path.join(installedDir, 'runtime', 'seeds', 'v1.seed.json'))).toBe(false);
    expect(fs.existsSync(path.join(installedDir, 'runtime', 'seeds', 'v2.seed.json'))).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(path.join(installedDir, 'abuddy.json'), 'utf-8'));
    expect(manifest.version).toBe('2.0.0');
  });

  it('hostVersion gating prevents loading incompatible packs', async () => {
    const { installPackFromLocal } = await import('../../../src/packs/pack-installer.ts');

    const sourceDir = path.join(tmpDir, 'future-pack');
    writeManifest(sourceDir, { id: 'future-pack', name: 'Future Pack', version: '1.0.0', hostVersion: '>=99.0.0' });
    writeBuild(sourceDir, 'future-pack');

    await installPackFromLocal(sourceDir, packsDir());

    const { loadExternalPacks } = await import('../../../src/packs/runtime/loader.ts');
    const packs = loadExternalPacks();

    // Pack is discovered but skipped due to hostVersion
    expect(packs).toEqual([]);
  });

  it('multiple packs coexist and all get discovered', async () => {
    const { installPackFromLocal } = await import('../../../src/packs/pack-installer.ts');

    for (const id of ['pack-alpha', 'pack-beta', 'pack-gamma']) {
      const dir = path.join(tmpDir, id);
      writeManifest(dir, { id, name: id.replace('-', ' '), version: '1.0.0' });
      writeBuild(dir, id);
      await installPackFromLocal(dir, packsDir());
    }

    const { loadExternalPacks } = await import('../../../src/packs/runtime/loader.ts');
    const packs = loadExternalPacks();
    const ids = packs.map(p => p.manifest.id).sort();
    expect(ids).toEqual(['pack-alpha', 'pack-beta', 'pack-gamma']);
  });
});

// A pack installed, enabled, disabled or uninstalled while the app runs changes what the running systems
// read (the chat's slash commands, say), so they have to be told
describe('activating and tearing down a pack at runtime', () => {
  const PACK_ID = 'activate-pack';
  const bus = { send: vi.fn() };

  /** Installs a pack with one system that declares a slash command in its manifest */
  async function install() {
    const { installPackFromLocal } = await import('../../../src/packs/pack-installer.ts');
    const sourceDir = path.join(tmpDir, PACK_ID);
    writeManifest(sourceDir, {
      id: PACK_ID,
      name: 'Activate Pack',
      version: '1.0.0',
      features: [{ id: 'main', system: { entry: 'src/features/main/be/system.ts' } }],
      commands: [{ name: 'activate-memo', placeholder: 'Text' }],
    });
    // The runtime carries what generate-entries writes from the manifest, commands and seeders included
    writeBuild(sourceDir, PACK_ID, "[{ id: 'main', machine: { id: 'activate-pack-system' }, events: [] }], commands: [{ name: 'activate-memo', placeholder: 'Text' }], seeders: [{ key: 'memos', seed: () => ({ created: 1, updated: 0, skipped: 0 }) }]");
    await installPackFromLocal(sourceDir, packsDir());
  }

  afterEach(async () => {
    if (registry.getPackContributions(PACK_ID)) registry.unregisterPack(PACK_ID);
    bus.send.mockReset();
  });

  it('registers the commands its manifest declares, and tells the running systems before starting its own', async () => {
    await install();
    const { activatePack } = await import('../../../src/packs/runtime/lifecycle.ts');
    const { getPackCommands } = await import('@abuddy/sdk/framework');

    expect(activatePack(registry, PACK_ID, bus as never, { seed: true })).toBe(true);

    expect(getPackCommands()).toEqual([{ name: 'activate-memo', placeholder: 'Text' }]);
    expect(bus.send.mock.calls.map(([event]) => event.type)).toEqual(['PACK_CHANGED', 'ACTIVATE_PACK']);
    expect(bus.send).toHaveBeenCalledWith({ type: 'PACK_CHANGED', packId: PACK_ID });
  });

  it('tells the running systems when enabling an installed pack, which seeds nothing', async () => {
    await install();
    const { activatePack } = await import('../../../src/packs/runtime/lifecycle.ts');

    expect(activatePack(registry, PACK_ID, bus as never)).toBe(true);

    expect(bus.send).toHaveBeenCalledWith({ type: 'PACK_CHANGED', packId: PACK_ID });
  });

  it('drops its commands and seeders when torn down, and tells the systems still running after stopping its own', async () => {
    await install();
    const { activatePack, teardownPack } = await import('../../../src/packs/runtime/lifecycle.ts');
    const { getPackCommands } = await import('@abuddy/sdk/framework');
    const { seedData } = await import('@abuddy/sdk/utils');
    activatePack(registry, PACK_ID, bus as never);
    const compiledDir = path.join(tmpDir, 'compiled-seeds');
    fs.mkdirSync(compiledDir);
    fs.writeFileSync(path.join(compiledDir, 'seeds.json'), JSON.stringify({ version: 1, packId: PACK_ID, seeds: [] }));
    expect(Object.keys(seedData({ compiledDir }))).toEqual(['memos']);
    bus.send.mockReset();

    teardownPack(registry, PACK_ID, bus as never);

    expect(getPackCommands()).toEqual([]);
    expect(seedData({ compiledDir })).toEqual({});
    expect(bus.send.mock.calls.map(([event]) => event.type)).toEqual(['TEARDOWN_PACK', 'PACK_CHANGED']);
    expect(bus.send).toHaveBeenCalledWith({ type: 'PACK_CHANGED', packId: PACK_ID });
  });

  it("says nothing when torn down to be replaced, so the systems never see the updating pack missing", async () => {
    await install();
    const { activatePack, teardownPack } = await import('../../../src/packs/runtime/lifecycle.ts');
    activatePack(registry, PACK_ID, bus as never);
    bus.send.mockReset();

    teardownPack(registry, PACK_ID, bus as never, { replacing: true });
    expect(bus.send.mock.calls.map(([event]) => event.type)).toEqual(['TEARDOWN_PACK']);

    // The activation that replaces it announces the change once
    activatePack(registry, PACK_ID, bus as never);
    expect(bus.send.mock.calls.map(([event]) => event.type)).toEqual(['TEARDOWN_PACK', 'PACK_CHANGED', 'ACTIVATE_PACK']);
  });
});

describe('registry source and update tracking', () => {
  it('stores source field in registry when GitHub slug is used', async () => {
    const { readPackRegistry, modifyRegistry, addToRegistry } = await import('../../../src/packs/pack-registry.ts');

    modifyRegistry(entries => addToRegistry(entries, {
      id: 'github-pack',
      name: 'GitHub Pack',
      version: '1.0.0',
      dir: path.join(packsDir(), 'github-pack'),
      enabled: true,
      source: 'owner/repo',
    }));

    const entries = readPackRegistry();
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe('owner/repo');
    expect(entries[0].availableVersion).toBeUndefined();
    expect(entries[0].lastUpdateCheck).toBeUndefined();
  });

  it('stores availableVersion and lastUpdateCheck after update check', async () => {
    const { readPackRegistry, modifyRegistry, addToRegistry } = await import('../../../src/packs/pack-registry.ts');

    modifyRegistry(entries => addToRegistry(entries, {
      id: 'versioned-pack',
      name: 'Versioned Pack',
      version: '1.0.0',
      dir: path.join(packsDir(), 'versioned-pack'),
      enabled: true,
      source: 'owner/versioned',
    }));

    const now = new Date().toISOString();
    modifyRegistry(entries =>
      entries.map(e => e.id === 'versioned-pack'
        ? { ...e, availableVersion: '2.0.0', lastUpdateCheck: now }
        : e,
      ),
    );

    const entries = readPackRegistry();
    const pack = entries.find(e => e.id === 'versioned-pack')!;
    expect(pack.availableVersion).toBe('2.0.0');
    expect(pack.lastUpdateCheck).toBe(now);
  });

  it('getAvailableUpdates returns packs with newer versions', async () => {
    const { modifyRegistry, addToRegistry } = await import('../../../src/packs/pack-registry.ts');
    const { getAvailableUpdates } = await import('../../../src/packs/pack-updater.ts');

    modifyRegistry(entries => {
      let updated = addToRegistry(entries, {
        id: 'has-update',
        name: 'Has Update',
        version: '1.0.0',
        dir: path.join(packsDir(), 'has-update'),
        enabled: true,
        source: 'owner/has-update',
      });
      updated = addToRegistry(updated, {
        id: 'no-update',
        name: 'No Update',
        version: '2.0.0',
        dir: path.join(packsDir(), 'no-update'),
        enabled: true,
        source: 'owner/no-update',
      });
      return updated;
    });

    modifyRegistry(entries =>
      entries.map(e => {
        if (e.id === 'has-update') return { ...e, availableVersion: '2.0.0' };
        if (e.id === 'no-update') return { ...e, availableVersion: '1.0.0' };
        return e;
      }),
    );

    const updates = getAvailableUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].packId).toBe('has-update');
    expect(updates[0].currentVersion).toBe('1.0.0');
    expect(updates[0].availableVersion).toBe('2.0.0');
  });
});

describe('FE pack deregistration', () => {
  it('unregisterPackFE removes contributions and returns removed plugins', async () => {
    const { registerPackFE, unregisterPackFE } = createFePackRegistry();

    const testPlugin = { id: 'test-plugin', label: 'Test' } as unknown as Plugin;
    registerPackFE({ plugins: [testPlugin] }, 'test-pack');

    const removed = unregisterPackFE('test-pack');
    expect(removed).toHaveLength(1);
    expect(removed[0].id).toBe('test-plugin');

    // Calling again should return empty
    const removedAgain = unregisterPackFE('test-pack');
    expect(removedAgain).toHaveLength(0);
  });

  it("unregisterPackFE leaves a plugin another registration owns when the pack declared the same id", async () => {
    const { registerPackFE, unregisterPackFE, getRegisteredPlugins } = createFePackRegistry();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const builtIn = { id: 'shared-id', label: 'Built-in' } as unknown as Plugin;
    const packCopy = { id: 'shared-id', label: 'Pack' } as unknown as Plugin;
    const packOwn = { id: 'pack-own', label: 'Own' } as unknown as Plugin;
    registerPackFE({ plugins: [builtIn] });
    registerPackFE({ plugins: [packCopy, packOwn] }, 'duplicate-pack');

    expect(getRegisteredPlugins().filter(p => p.id === 'shared-id')).toEqual([builtIn]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"shared-id" from pack duplicate-pack ignored'));
    warn.mockRestore();

    expect(unregisterPackFE('duplicate-pack')).toEqual([packOwn]);
    expect(getRegisteredPlugins()).toContain(builtIn);
    expect(getRegisteredPlugins()).not.toContain(packOwn);
  });

  it('unregisterPackFE handles pack with no contributions gracefully', async () => {
    const { unregisterPackFE } = createFePackRegistry();

    const removed = unregisterPackFE('nonexistent-pack');
    expect(removed).toHaveLength(0);
  });
});

describe('pack-registration teardown', () => {
  it('registerPack then unregisterPack cleans up SDK registries', async () => {
    const { registerPack, unregisterPack, getPackContributions } = registry;

    const packId = 'teardown-test-pack';
    registerPack({
      id: packId,
      systems: [],
      steps: [],
      artifacts: [],
      blocks: [],
    });

    expect(getPackContributions(packId)).not.toBeNull();

    unregisterPack(packId);

    expect(getPackContributions(packId)).toBeNull();
  });

  it('unregisterPack throws for unknown pack', async () => {
    expect(() => registry.unregisterPack('nonexistent')).toThrow('Pack "nonexistent" is not registered');
  });
});
