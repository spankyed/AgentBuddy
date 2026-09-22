// Before 0.3.15 every plugin ran under its bare feature id, and the built-in pack's settings row stored, under it,
// each plugin's settings and, in `plugins._meta`, the app shell's state: which plugins' tabs show and the plugin last
// open. The host's 0.3.15 app migration moves the shell's state into AppState, each id onto its plugin's ref, and
// every pack's plugin settings onto their refs.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setup } from 'xstate';
import { tx, untypedQx } from '@abuddy/ears';
import type { EARS } from '@abuddy/sdk';
import type { PackFeature } from '@abuddy/sdk/framework';
import { resetTestData } from '@abuddy/sdk/testing';
import { registry } from '../packs/runtime/test-host.ts';
import { appState } from '../../src/app-state/index.ts';
import { appMigrations } from '../../src/migrations/app/index.ts';
import type { InstalledManifests } from '../../src/migrations/app/0.3.15.ts';
import { hostRegistration } from '../../src/features/registration.ts';
import { writeInstalledPacks } from '../../src/packs/installed.ts';

const SETTINGS_ID = 'Settings-app' as EARS.EntityId;

/** Features with a plugin each, by id */
const withPlugins = (...ids: string[]): Record<string, PackFeature> => Object.fromEntries(ids.map((id) => [id, { plugin: { receives: [] } }]));

/** The settings as 0.3.14 stored them: every plugin under its feature id */
const OLD_SETTINGS = {
  general: { application: { openLinksInApp: false } },
  plugins: {
    memos: { sort: 'newest' },
    notes: { fontSize: 14 },
    _meta: { visibility: { memos: true, board: false, notes: true, packs: false, hermes: false }, lastActivePlugin: 'memos' },
  },
};

const settings = () => untypedQx(SETTINGS_ID).pickOne(['data'])?.data;

/** Runs the migration; `installed` stands for the packs installed on disk, none unless a test says */
const move = (installed: InstalledManifests = () => []) => {
  const migration = appMigrations(registry, installed).find((m) => m.target === '0.3.15');
  if (!migration) throw new Error('no 0.3.15 app migration');
  migration.up();
};

beforeAll(() => {
  const origin = (id: string, builtIn: boolean) => ({ id, name: id, version: '1.0.0', dir: `packs/${id}`, builtIn });
  // `notes` is the built-in pack's feature too: before 0.3.15 the built-in plugin ran under it
  registry.registerPack({ id: 'memo-pack', features: withPlugins('memos', 'board', 'notes') }, origin('memo-pack', false));
  registry.registerPack({ id: 'built-in', features: withPlugins('notes', 'threads', 'code') }, origin('built-in', true));
  // A feature with settings and a system but no plugin
  registry.registerPack({ id: 'sync-pack', features: { sync: { system: { machine: setup({}).createMachine({}), receives: [] } } } }, origin('sync-pack', false));
  // The host's packs plugin, as the API registers it
  registry.registerPack(hostRegistration());
});

beforeEach(() => {
  resetTestData();
  tx(SETTINGS_ID, true).put('entityType', 'Settings').put('data', structuredClone(OLD_SETTINGS));
});

describe('the 0.3.15 app migration, for plugins', () => {
  it("moves the shell's state into AppState, each id onto its plugin's ref", () => {
    move();

    expect(appState.get()).toMatchObject({
      // A bare id a built-in pack has is the built-in plugin's, even when an external pack has the feature id too
      pluginVisibility: { 'memo-pack/memos': true, 'memo-pack/board': false, 'built-in/notes': true, 'host/packs': false },
      lastActivePlugin: 'memo-pack/memos',
    });
  });

  // 0.3.14 stored its whole default settings, so every row holds every default tab: those are no choice of the user's
  it("moves only the tabs the user changed from 0.3.14's defaults, and the plugin last open", () => {
    tx(SETTINGS_ID).put('data', {
      plugins: {
        _meta: {
          visibility: {
            threads: true, code: false, library: true, flows: false, actions: false, prompts: false, brain: false,
            database: false, logs: false, browser: false, notes: false, settings: true, memos: true,
          },
          lastActivePlugin: 'notes',
        },
      },
    });

    move();

    expect(appState.get()).toEqual({
      ...appState.get(),
      pluginVisibility: { 'built-in/code': false, 'memo-pack/memos': true },
      lastActivePlugin: 'built-in/notes',
    });
  });

  it('drops plugin settings no installed pack owns, or two external packs share', () => {
    tx(SETTINGS_ID).put('data', { plugins: { calendar: { week: 'mon' }, board: { cols: 3 }, drafts: { wrap: true } } });

    move(() => [
      { id: 'draft-pack', features: [{ id: 'drafts' }] },
      { id: 'a-pack', features: [{ id: 'board' }] },
      { id: 'b-pack', features: [{ id: 'board' }] },
    ]);

    expect(settings()).toEqual({ plugins: { 'draft-pack/drafts': { wrap: true } } });
  });

  it('drops a tab choice no installed pack has', () => {
    move();
    expect(appState.get().pluginVisibility).not.toHaveProperty('hermes');
  });

  // It runs once, so a pack that isn't loaded at that boot (disabled, or an old build that no longer loads) would
  // otherwise keep its keys bare for good, where nothing reads them
  it("moves an installed pack's keys when the pack isn't registered, from its manifest", () => {
    tx(SETTINGS_ID).put('data', { plugins: { drafts: { wrap: true }, _meta: { visibility: { drafts: false } } } });

    move(() => [{ id: 'draft-pack', features: [{ id: 'drafts' }] }]);

    expect(settings()).toEqual({ plugins: { 'draft-pack/drafts': { wrap: true } } });
    expect(appState.get().pluginVisibility).toEqual({ 'draft-pack/drafts': false });
  });

  // One broken pack on disk mustn't stop the migration, which would stop every boot's migrations and seeds
  it("moves every other key when an installed pack's manifest is malformed", () => {
    tx(SETTINGS_ID).put('data', { plugins: { drafts: { wrap: true }, memos: { sort: 'oldest' } } });

    move(() => [
      { id: 'broken-pack', features: { drafts: {} } } as never,
      { id: 'odd-pack', features: [null, { id: 7 }, { name: 'no id' }] } as never,
      { id: 'draft-pack', features: [{ id: 'drafts' }] },
    ]);

    expect(settings()).toEqual({ plugins: { 'draft-pack/drafts': { wrap: true }, 'memo-pack/memos': { sort: 'oldest' } } });
  });

  // Before 0.3.15 the host's plugins ran under bare ids too, so a bare id it shares with an external feature was its;
  // the bus is no feature and owns no key
  it("gives a bare id the host shares to the host, and none to the bus", () => {
    tx(SETTINGS_ID).put('data', { plugins: { packs: { sort: 'name' }, bus: { mode: 'x' } } });

    move(() => [{ id: 'ext-pack', features: [{ id: 'packs' }, { id: 'bus' }] }]);

    expect(settings()).toEqual({ plugins: { 'host/packs': { sort: 'name' }, 'ext-pack/bus': { mode: 'x' } } });
  });

  it('moves the settings of a feature with no plugin', () => {
    tx(SETTINGS_ID).put('data', { plugins: { sync: { interval: 5 } } });

    move();

    expect(settings()).toEqual({ plugins: { 'sync-pack/sync': { interval: 5 } } });
  });

  // Before any pack's migration reads them: the built-in pack's migrations run after the host's
  it("moves every pack's plugin settings onto their refs, the built-in pack's included, and leaves no _meta", () => {
    move();

    expect(settings()).toEqual({
      general: { application: { openLinksInApp: false } },
      plugins: { 'memo-pack/memos': { sort: 'newest' }, 'built-in/notes': { fontSize: 14 } },
    });
  });

  it('changes nothing when it runs again', () => {
    move();
    const [moved, state] = [settings(), appState.get()];

    move();

    expect(settings()).toEqual(moved);
    expect(appState.get()).toEqual(state);
  });

  it('keeps what AppState already records', () => {
    appState.update({ pluginVisibility: { 'memo-pack/memos': false }, lastActivePlugin: 'host/packs' });

    move();

    expect(appState.get()).toMatchObject({
      pluginVisibility: { 'memo-pack/memos': false, 'memo-pack/board': false },
      lastActivePlugin: 'host/packs',
    });
  });

  it("moves a last-active host plugin onto the host's ref", () => {
    tx(SETTINGS_ID).put('data', { plugins: { _meta: { lastActivePlugin: 'packs' } } });

    move();

    expect(appState.get().lastActivePlugin).toBe('host/packs');
    expect(settings()).toEqual({ plugins: {} });
  });

  it('does nothing without stored plugin settings', () => {
    tx(SETTINGS_ID).put('data', { general: {} });

    move();

    expect(settings()).toEqual({ general: {} });
    expect(appState.get().pluginVisibility).toEqual({});
  });
});

// With no manifests given, the migration reads the packs installed in the app's data dir, as the app runs it
describe('the 0.3.15 app migration, over the packs installed on disk', () => {
  let userDataDir: string;
  const saved = { env: process.env.ABUDDY_ENV, dir: process.env.ABUDDY_USER_DATA_DIR };

  const install = (dirName: string, manifest: string) => {
    const dir = path.join(userDataDir, 'packs', dirName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'abuddy.json'), manifest);
  };

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-settings-0315-'));
    process.env.ABUDDY_ENV = 'test';
    process.env.ABUDDY_USER_DATA_DIR = userDataDir;
  });

  afterEach(() => {
    for (const [key, value] of [['ABUDDY_ENV', saved.env], ['ABUDDY_USER_DATA_DIR', saved.dir]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it("moves the keys of an enabled and a disabled pack's features, and drops a malformed manifest's", () => {
    install('draft-pack', JSON.stringify({ id: 'draft-pack', name: 'Drafts', version: '1.0.0', features: [{ id: 'drafts' }] }));
    install('idle-pack', JSON.stringify({ id: 'idle-pack', name: 'Idle', version: '1.0.0', features: [{ id: 'idle' }] }));
    writeInstalledPacks([{ id: 'idle-pack', enabled: false }]);
    install('broken-pack', JSON.stringify({ id: 'broken-pack', name: 'Broken', version: '1.0.0', features: { broken: {} } }));
    install('garbled-pack', '{ not json');
    tx(SETTINGS_ID).put('data', {
      plugins: { drafts: { wrap: true }, idle: { quiet: true }, broken: { on: true }, _meta: { visibility: { drafts: false, idle: true, broken: true } } },
    });

    const migration = appMigrations(registry).find((m) => m.target === '0.3.15')!;
    migration.up();

    expect(settings()).toEqual({ plugins: { 'draft-pack/drafts': { wrap: true }, 'idle-pack/idle': { quiet: true } } });
    expect(appState.get().pluginVisibility).toEqual({ 'draft-pack/drafts': false, 'idle-pack/idle': true });
  });
});
