import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Plugin, PluginDefinition } from '@apack/sdk/fe';

import { resetTestData } from '@apack/sdk/testing';
import { registry } from './test-host.ts';
import { appliedContent, appState } from '../../../src/app-state/index.ts';
import { createFePackRegistry } from '../../../src/fe/pack-store.ts';
import { PACK_SNAPSHOT_FORMAT } from '@apack/sdk/build';
import { _appDirOf } from '@apack/sdk/env';
import { PACK_LAYOUT } from '../../../src/packs/layout.ts';

let tmpDir: string;
let origEnv: { env?: string; userDataDir?: string };

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-lifecycle-'));
  origEnv = { env: process.env.APACK_ENV, userDataDir: process.env.APACK_USER_DATA_DIR };
  process.env.APACK_ENV = 'test';
  process.env.APACK_USER_DATA_DIR = tmpDir;
});

afterEach(() => {
  restoreEnv('APACK_ENV', origEnv.env);
  restoreEnv('APACK_USER_DATA_DIR', origEnv.userDataDir);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

const packsDir = () => path.join(_appDirOf(tmpDir), 'packs');

/** Writes what `apack build` leaves in a pack's dist/: a runtime registering `featuresSource`, and a snapshot */
function writeBuild(packDir: string, id: string, featuresSource = '{}', extraFiles: Record<string, string> = {}) {
  const write = (rel: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(packDir, 'dist', rel)), { recursive: true });
    fs.writeFileSync(path.join(packDir, 'dist', rel), content);
  };
  write('runtime/index.cjs', `module.exports = { registration: { id: ${JSON.stringify(id)}, features: ${featuresSource} } };`);
  write(PACK_LAYOUT.snapshot, JSON.stringify({ format: PACK_SNAPSHOT_FORMAT }));
  for (const [rel, content] of Object.entries(extraFiles)) write(rel, content);
}

function writeManifest(dir: string, manifest: Record<string, unknown>) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'apack.json'), JSON.stringify(manifest));
}

describe('pack full lifecycle: install → discover', () => {
  it('update flow: reinstalling overwrites the previous version', async () => {
    const { installPackFromLocal } = await import('../../../src/packs/installer.ts');

    const sourceDir = path.join(tmpDir, 'update-pack');

    // v1
    writeManifest(sourceDir, { id: 'update-pack', name: 'Update Pack', version: '1.0.0' });
    writeBuild(sourceDir, 'update-pack', '{}', { 'runtime/content/v1.content.json': '[]' });

    await installPackFromLocal(sourceDir, packsDir());

    const installedDir = path.join(packsDir(), 'update-pack');
    expect(fs.existsSync(path.join(installedDir, 'runtime', 'content', 'v1.content.json'))).toBe(true);

    // v2: new file, old one removed
    writeManifest(sourceDir, { id: 'update-pack', name: 'Update Pack', version: '2.0.0' });
    fs.rmSync(path.join(sourceDir, 'dist'), { recursive: true });
    writeBuild(sourceDir, 'update-pack', '{}', { 'runtime/content/v2.content.json': '[]' });

    await installPackFromLocal(sourceDir, packsDir());

    // v1 file should be gone (fresh copy)
    expect(fs.existsSync(path.join(installedDir, 'runtime', 'content', 'v1.content.json'))).toBe(false);
    expect(fs.existsSync(path.join(installedDir, 'runtime', 'content', 'v2.content.json'))).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(path.join(installedDir, 'apack.json'), 'utf-8'));
    expect(manifest.version).toBe('2.0.0');
  });

  it('multiple packs coexist and all get discovered', async () => {
    const { installPackFromLocal } = await import('../../../src/packs/installer.ts');

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

  /** Installs a pack with one system that declares a slash command in its manifest, a 1.0.0 migration and content */
  async function install() {
    const { installPackFromLocal } = await import('../../../src/packs/installer.ts');
    const sourceDir = path.join(tmpDir, PACK_ID);
    writeManifest(sourceDir, {
      id: PACK_ID,
      name: 'Activate Pack',
      version: '1.0.0',
      features: { main: { system: { entry: 'src/features/main/be/system.ts' } } },
      extensions: { commands: { 'activate-memo': { placeholder: 'Text' } } },
    });
    // The runtime carries what generate-entries writes from the manifest, commands and appliers included
    writeBuild(
      sourceDir,
      PACK_ID,
      `{ main: { system: { machine: { id: 'activate-pack-system' }, receives: [] } } }, commands: [{ name: 'activate-memo', placeholder: 'Text' }], `
        + "appliers: [{ key: 'memos', apply: () => { globalThis.activatePackRuns.push('apply'); return { created: 1, updated: 0, skipped: 0 }; } }], "
        + "migrations: { pack: [{ target: '1.0.0', description: 'memos', up: () => { globalThis.activatePackRuns.push('migration'); } }] }",
      {
        'runtime/content/memos.content.json': '[]',
        'runtime/content/content.json': JSON.stringify({ version: 1, packId: PACK_ID, entries: [] }),
      },
    );
    await installPackFromLocal(sourceDir, packsDir());
  }

  /** What the pack's migration and applier did, in order */
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
    const { getPackCommands } = await import('@apack/sdk/framework');

    expect(activatePack(registry, PACK_ID, bus as never)).toBe(true);

    expect(getPackCommands()).toEqual([{ name: 'activate-memo', placeholder: 'Text' }]);
    expect(bus.send.mock.calls.map(([event]) => event.type)).toEqual(['PACK_CHANGED', 'ACTIVATE_PACK']);
    expect(bus.send).toHaveBeenCalledWith({ type: 'PACK_CHANGED', packId: PACK_ID });
  });

  it('runs its migrations, then its content, as a boot does, and neither again when it activates unchanged', async () => {
    await install();
    const { activatePack, teardownPack } = await import('../../../src/packs/runtime/lifecycle.ts');

    expect(activatePack(registry, PACK_ID, bus as never)).toBe(true);
    expect(runs).toEqual(['migration', 'apply']);
    expect(appState.get()).toMatchObject({ packVersions: { [PACK_ID]: '1.0.0' } });
    expect(appliedContent.get(PACK_ID).revision).toEqual(expect.any(String));

    // Disabled, then enabled again
    teardownPack(registry, PACK_ID, bus as never);
    expect(activatePack(registry, PACK_ID, bus as never)).toBe(true);
    expect(runs).toEqual(['migration', 'apply']);
  });

  it('drops its commands and appliers when torn down, and tells the systems still running after stopping its own', async () => {
    await install();
    const { activatePack, teardownPack } = await import('../../../src/packs/runtime/lifecycle.ts');
    const { getPackCommands } = await import('@apack/sdk/framework');
    const { importCompiledContent } = await import('@apack/sdk/utils');
    activatePack(registry, PACK_ID, bus as never);
    const compiledDir = path.join(tmpDir, 'compiled-content');
    fs.mkdirSync(compiledDir);
    fs.writeFileSync(path.join(compiledDir, 'content.json'), JSON.stringify({ version: 1, packId: PACK_ID, entries: [] }));
    expect(Object.keys(importCompiledContent({ compiledDir }))).toEqual(['memos']);
    bus.send.mockReset();

    teardownPack(registry, PACK_ID, bus as never);

    expect(getPackCommands()).toEqual([]);
    expect(importCompiledContent({ compiledDir })).toEqual({});
    expect(bus.send.mock.calls.map(([event]) => event.type)).toEqual(['TEARDOWN_PACK', 'PACK_CHANGED']);
    expect(bus.send).toHaveBeenCalledWith({ type: 'PACK_CHANGED', packId: PACK_ID });
  });

  // Its contributions come out one at a time and one can fail — a settings listener that throws is enough.
  // The pack is unregistered either way, so the rest of the teardown still has to run, its systems stopped
  // and the systems still up told; and what failed has to be reported as that, not as a pack nobody had
  // registered.
  it('finishes tearing a pack down when one of its contributions will not come out', async () => {
    const { teardownPack } = await import('../../../src/packs/runtime/lifecycle.ts');
    const { onPackSettingsDefaultsChanged } = await import('@apack/sdk/framework');
    const { testRootEvents } = await import('@apack/sdk/testing');

    registry.registerPack({
      id: 'stuck-pack',
      features: { stuck: { plugin: { receives: [] }, settings: { plugins: { stuck: { a: 1 } } } } },
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
    fs.writeFileSync(path.join(dir, 'apack.json'), JSON.stringify({ id, name: id, version }));
  }

  it('records where an install came from', async () => {
    const { packRecord, recordInstalled } = await import('../../../src/packs/installed.ts');

    recordInstalled('github-pack', 'owner/repo');

    expect(packRecord('github-pack')).toMatchObject({ installedFrom: 'owner/repo', enabled: true });
    expect(packRecord('github-pack').availableVersion).toBeUndefined();
  });

  it('records what an update check found, and forgets it once that update is installed', async () => {
    const { packRecord, recordInstalled, recordUpdateCheck, recordUpdateInstalled } = await import('../../../src/packs/installed.ts');
    recordInstalled('versioned-pack', 'owner/versioned');

    recordUpdateCheck('versioned-pack', { availableVersion: '2.0.0', availableTag: 'v2.0.0', updateCheckError: undefined });
    expect(packRecord('versioned-pack').availableVersion).toBe('2.0.0');

    recordUpdateInstalled('versioned-pack');
    expect(packRecord('versioned-pack').availableVersion).toBeUndefined();
    expect(packRecord('versioned-pack').installedFrom, 'the slug an update reinstalls from').toBe('owner/versioned');
  });

  it('getAvailableUpdates returns packs with newer versions', async () => {
    const { recordInstalled, recordUpdateCheck } = await import('../../../src/packs/installed.ts');
    const { getAvailableUpdates } = await import('../../../src/packs/updater.ts');
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

    const testPlugin = { label: 'Test' } as unknown as PluginDefinition;
    registerPackFE({ id: 'test-pack', features: { testPlugin: { plugin: testPlugin } } });

    const removed = unregisterPackFE('test-pack');
    expect(removed).toHaveLength(1);
    expect(removed[0].id).toBe('test-pack/testPlugin');

    // Calling again should return empty
    const removedAgain = unregisterPackFE('test-pack');
    expect(removedAgain).toHaveLength(0);
  });

  // A shipped pack's registration carries its id like any other, so it comes out the same way
  it('takes a shipped pack\'s frontend back out like any other pack\'s', async () => {
    const { registerPackFE, unregisterPackFE, getRegisteredPlugins } = createFePackRegistry();
    const shipped = { label: 'Built-in', id: 'default-setup/main' } as unknown as Plugin;

    registerPackFE({ id: 'default-setup', features: { main: { plugin: { label: 'Built-in' } as PluginDefinition } } });
    expect(getRegisteredPlugins()).toEqual([shipped]);

    expect(unregisterPackFE('default-setup')).toEqual([shipped]);
    expect(getRegisteredPlugins()).toEqual([]);
  });

  // Two packs with the same feature each have their own plugin; unregistering one leaves the other's
  it('unregisterPackFE handles pack with no extensions gracefully', async () => {
    const { unregisterPackFE } = createFePackRegistry();

    const removed = unregisterPackFE('nonexistent-pack');
    expect(removed).toHaveLength(0);
  });
});

describe('pack-registration teardown', () => {
  it('unregisterPack throws for unknown pack', async () => {
    expect(() => registry.unregisterPack('nonexistent')).toThrow('Pack "nonexistent" is not registered');
  });
});
