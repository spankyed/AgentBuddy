// Before 0.3.15 every plugin ran under its bare feature id, and the built-in pack's settings row stored, under it,
// each plugin's settings and, in `plugins._meta`, the app shell's state: which plugins' tabs show and the plugin last
// open. The host's 0.3.15 app migration moves the shell's state into AppState, each id onto its plugin's ref, and
// every pack's plugin settings onto their refs.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tx, untypedQx } from '@abuddy/ears';
import type { EARS } from '@abuddy/sdk';
import type { PackFeature } from '@abuddy/sdk/framework';
import { resetTestData } from '@abuddy/sdk/testing';
import { registry } from '../packs/runtime/test-host.ts';
import { appState } from '../../src/app-state/index.ts';
import { appMigrations } from '../../src/migrations/app/index.ts';
import { hostRegistration } from '../../src/packs/host-pack.ts';

const SETTINGS_ID = 'Settings-app' as EARS.EntityId;

/** Features with a plugin each, by id */
const withPlugins = (...ids: string[]): Record<string, PackFeature> => Object.fromEntries(ids.map((id) => [id, { plugin: { receives: [] } }]));

/** The settings as 0.3.14 stored them: every plugin under its feature id */
const OLD_SETTINGS = {
  general: { application: { openLinksInApp: false } },
  plugins: {
    memos: { sort: 'newest' },
    notes: { fontSize: 14 },
    _meta: { visibility: { memos: true, board: false, notes: false, packs: false, hermes: false }, lastActivePlugin: 'memos' },
  },
};

const settings = () => untypedQx(SETTINGS_ID).pickOne(['data'])?.data;

const move = () => {
  const migration = appMigrations(registry).find((m) => m.target === '0.3.15');
  if (!migration) throw new Error('no 0.3.15 app migration');
  migration.up();
};

beforeAll(() => {
  const origin = (id: string, builtIn: boolean) => ({ id, name: id, version: '1.0.0', dir: `packs/${id}`, builtIn });
  // `notes` is the built-in pack's feature too: before 0.3.15 the built-in plugin ran under it
  registry.registerPack({ id: 'memo-pack', features: withPlugins('memos', 'board', 'notes') }, origin('memo-pack', false));
  registry.registerPack({ id: 'built-in', features: withPlugins('notes') }, origin('built-in', true));
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
      pluginVisibility: { 'memo-pack/memos': true, 'memo-pack/board': false, 'built-in/notes': false, 'host/packs': false },
      lastActivePlugin: 'memo-pack/memos',
    });
  });

  it('drops a tab choice no registered plugin owns', () => {
    move();
    expect(appState.get().pluginVisibility).not.toHaveProperty('hermes');
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
