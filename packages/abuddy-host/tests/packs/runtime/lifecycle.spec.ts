import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Plugin } from '@abuddy/sdk/fe';

import { resetTestData } from '@abuddy/sdk/testing';
import { registry } from './test-host.ts';
import { appState } from '../../../src/app-state/index.ts';
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
    const ids = packs.map(p => p.origin.id).sort();
    expect(ids).toEqual(['pack-alpha', 'pack-beta', 'pack-gamma']);
  });
});

// A pack installed, enabled, disabled or uninstalled while the app runs changes what the running systems
// read (the chat's slash commands, say), so they have to be told
describe('activating and tearing down a pack at runtime', () => {
  const PACK_ID = 'activate-pack';
  const bus = { send: vi.fn() };

  /** Installs a pack with one system that declares a slash command in its manifest, a 1.0.0 migration and seeds */
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
    writeBuild(
      sourceDir,
      PACK_ID,
      "[{ id: 'main', machine: { id: 'activate-pack-system' }, events: [] }], commands: [{ name: 'activate-memo', placeholder: 'Text' }], "
        + "seeders: [{ key: 'memos', seed: () => { globalThis.activatePackRuns.push('seed'); return { created: 1, updated: 0, skipped: 0 }; } }], "
        + "migrations: [{ target: '1.0.0', description: 'memos', up: () => { globalThis.activatePackRuns.push('migration'); } }]",
      {
        'runtime/seeds/memos.seed.json': '[]',
        'runtime/seeds/seeds.json': JSON.stringify({ version: 1, packId: PACK_ID, seeds: [] }),
      },
    );
    await installPackFromLocal(sourceDir, packsDir());
  }

  /** What the pack's migration and seeder did, in order */
  const runs: string[] = [];
  beforeEach(() => {
    resetTestData();
    runs.length = 0;
    Object.assign(globalThis, { activatePackRuns: runs });
  });

  afterEach(async () => {
    if (registry.getPackExtensions(PACK_ID)) registry.unregisterPack(PACK_ID);
    bus.send.mockReset();
  });

  it('registers the commands its manifest declares, and tells the running systems before starting its own', async () => {
    await install();
    const { activatePack } = await import('../../../src/packs/runtime/lifecycle.ts');
    const { getPackCommands } = await import('@abuddy/sdk/framework');

    expect(activatePack(registry, PACK_ID, bus as never)).toBe(true);

    expect(getPackCommands()).toEqual([{ name: 'activate-memo', placeholder: 'Text' }]);
    expect(bus.send.mock.calls.map(([event]) => event.type)).toEqual(['PACK_CHANGED', 'ACTIVATE_PACK']);
    expect(bus.send).toHaveBeenCalledWith({ type: 'PACK_CHANGED', packId: PACK_ID });
  });

  it('runs its migrations, then its seeds, as a boot does, and neither again when it activates unchanged', async () => {
    await install();
    const { activatePack, teardownPack } = await import('../../../src/packs/runtime/lifecycle.ts');

    expect(activatePack(registry, PACK_ID, bus as never)).toBe(true);
    expect(runs).toEqual(['migration', 'seed']);
    expect(appState.get()).toMatchObject({ packVersions: { [PACK_ID]: '1.0.0' }, packSeedHashes: { [PACK_ID]: expect.any(String) } });

    // Disabled, then enabled again
    teardownPack(registry, PACK_ID, bus as never);
    expect(activatePack(registry, PACK_ID, bus as never)).toBe(true);
    expect(runs).toEqual(['migration', 'seed']);
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

  // Its contributions come out one at a time and one can fail — a settings listener that throws is enough.
  // The pack is unregistered either way, so the rest of the teardown still has to run, its systems stopped
  // and the systems still up told; and what failed has to be reported as that, not as a pack nobody had
  // registered.
  it('finishes tearing a pack down when one of its contributions will not come out', async () => {
    const { teardownPack } = await import('../../../src/packs/runtime/lifecycle.ts');
    const { onPackSettingsDefaultsChanged } = await import('@abuddy/sdk/framework');
    const { testRootEvents } = await import('@abuddy/sdk/testing');

    registry.registerPack({
      id: 'stuck-pack',
      systems: [],
      features: [{ id: 'stuck', hasSystem: false, hasPlugin: true, services: [], settings: { plugins: { stuck: { a: 1 } } } }],
    });
    const stopListening = onPackSettingsDefaultsChanged(() => { throw new Error('a settings listener threw'); });

    // The cause is on the event, not in its text: the logger puts an error in `stack`/`meta`
    const logged: string[] = [];
    const stopLogging = testRootEvents.onLog((event) => void logged.push(`${event.message} ${event.stack ?? ''} ${JSON.stringify(event.meta ?? {})}`));
    bus.send.mockReset();
    try {
      teardownPack(registry, 'stuck-pack', bus as never);
    } finally {
      stopLogging();
      stopListening();
    }

    expect(registry.getPackRegistration('stuck-pack')).toBeNull();
    expect(bus.send.mock.calls.map(([event]) => event.type)).toContain('PACK_CHANGED');
    expect(logged.join('\n')).toContain('a settings listener threw');
    expect(logged.join('\n')).not.toContain('was not previously registered');
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

  // An update downloads between the two, so the pack's plugins belong to nobody for that whole time.
  // Sends there are still dropped — nothing is running to receive them — but they are expected.
  it("marks its plugins as expected to be missing while it is replaced, and not when it is torn down for good", async () => {
    await install();
    const { activatePack, teardownPack } = await import('../../../src/packs/runtime/lifecycle.ts');
    // The marking has to happen while the pack is still registered, since that is what says which
    // plugins are its own — so it is asserted on the call, not on this fixture, which has no plugin
    const marked = vi.spyOn(registry, 'markPackReplacing');
    activatePack(registry, PACK_ID, bus as never);

    teardownPack(registry, PACK_ID, bus as never, { replacing: true });
    expect(marked).toHaveBeenCalledWith(PACK_ID);
    expect(registry.getPackRegistration(PACK_ID), 'marked before unregistering').toBeFalsy();

    marked.mockClear();
    activatePack(registry, PACK_ID, bus as never);
    teardownPack(registry, PACK_ID, bus as never);
    expect(marked, 'a teardown for good opens no window').not.toHaveBeenCalled();
    marked.mockRestore();
  });
});

describe('registry source and update tracking', () => {
  /** The pack on disk, which is what makes it installed and where its version comes from */
  function installed(id: string, version = '1.0.0') {
    const dir = path.join(packsDir(), id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'abuddy.json'), JSON.stringify({ id, name: id, version }));
  }

  it('records where an install came from', async () => {
    const { packRecord, recordInstalled } = await import('../../../src/packs/installed-packs.ts');

    recordInstalled('github-pack', 'owner/repo');

    expect(packRecord('github-pack')).toMatchObject({ installedFrom: 'owner/repo', enabled: true });
    expect(packRecord('github-pack').availableVersion).toBeUndefined();
  });

  it('records what an update check found, and forgets it once that update is installed', async () => {
    const { packRecord, recordInstalled, recordUpdateCheck, recordUpdateInstalled } = await import('../../../src/packs/installed-packs.ts');
    recordInstalled('versioned-pack', 'owner/versioned');

    recordUpdateCheck('versioned-pack', { availableVersion: '2.0.0', availableTag: 'v2.0.0', updateCheckError: undefined });
    expect(packRecord('versioned-pack').availableVersion).toBe('2.0.0');

    recordUpdateInstalled('versioned-pack');
    expect(packRecord('versioned-pack').availableVersion).toBeUndefined();
    expect(packRecord('versioned-pack').installedFrom, 'the slug an update reinstalls from').toBe('owner/versioned');
  });

  it('getAvailableUpdates returns packs with newer versions', async () => {
    const { recordInstalled, recordUpdateCheck } = await import('../../../src/packs/installed-packs.ts');
    const { getAvailableUpdates } = await import('../../../src/packs/pack-updater.ts');
    installed('has-update');
    installed('no-update');

    recordInstalled('has-update', 'owner/has-update');
    recordInstalled('no-update', 'owner/no-update');
    recordUpdateCheck('has-update', { availableVersion: '2.0.0', availableTag: 'v2.0.0', updateCheckError: undefined });
    recordUpdateCheck('no-update', { availableVersion: '1.0.0', availableTag: 'v1.0.0', updateCheckError: undefined });

    const updates = getAvailableUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].packId).toBe('has-update');
    expect(updates[0].currentVersion).toBe('1.0.0');
    expect(updates[0].availableVersion).toBe('2.0.0');
  });
});

describe('FE pack deregistration', () => {
  it('unregisterPackFE removes extensions and returns removed plugins', async () => {
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

  it('unregisterPackFE handles pack with no extensions gracefully', async () => {
    const { unregisterPackFE } = createFePackRegistry();

    const removed = unregisterPackFE('nonexistent-pack');
    expect(removed).toHaveLength(0);
  });
});

describe('pack-registration teardown', () => {
  it('registerPack then unregisterPack cleans up SDK registries', async () => {
    const { registerPack, unregisterPack, getPackExtensions } = registry;

    const packId = 'teardown-test-pack';
    registerPack({
      id: packId,
      systems: [],
      steps: [],
      artifacts: [],
      blocks: [],
    });

    expect(getPackExtensions(packId)).not.toBeNull();

    unregisterPack(packId);

    expect(getPackExtensions(packId)).toBeNull();
  });

  it('unregisterPack throws for unknown pack', async () => {
    expect(() => registry.unregisterPack('nonexistent')).toThrow('Pack "nonexistent" is not registered');
  });
});
