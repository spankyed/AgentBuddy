// Before 0.3.15 every plugin ran under its bare feature id, and the settings stored an installed external pack's
// plugin settings, sidebar visibility and last-active plugin under it, and the host's own (`packs`). The host's
// 0.3.15 app migration moves them onto the plugins' refs; the built-in packs' keys are left to their own
// migrations.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tx, untypedQx } from '@abuddy/ears';
import type { EARS } from '@abuddy/sdk';
import type { PackFeatureDef } from '@abuddy/sdk/framework';
import { resetTestData } from '@abuddy/sdk/testing';
import { registry } from '../packs/runtime/test-host.ts';
import { appMigrations } from '../../src/migrations/app/index.ts';

const SETTINGS_ID = 'Settings-app' as EARS.EntityId;

const withPlugin = (id: string): PackFeatureDef => ({ id, hasSystem: false, hasPlugin: true, services: [] });

/** The settings as 0.3.14 stored them: every plugin under its feature id */
const OLD_SETTINGS = {
  general: { application: { openLinksInApp: false } },
  plugins: {
    memos: { sort: 'newest' },
    notes: { fontSize: 14 },
    _meta: { visibility: { memos: true, board: false, notes: false, packs: false }, lastActivePlugin: 'memos' },
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
  registry.registerPack({ id: 'memo-pack', systems: [], features: [withPlugin('memos'), withPlugin('board'), withPlugin('notes')] }, origin('memo-pack', false));
  registry.registerPack({ id: 'built-in', systems: [], features: [withPlugin('notes')] }, origin('built-in', true));
  // The host's packs plugin, as the API registers it
  registry.registerHostPlugin('host/packs', []);
});

beforeEach(() => {
  resetTestData();
  tx(SETTINGS_ID, true).put('entityType', 'Settings').put('data', structuredClone(OLD_SETTINGS));
});

describe("the 0.3.15 app migration, for an external pack's plugins", () => {
  it('moves its plugin settings, its pinned and hidden plugins and the last-active plugin onto their addresses', () => {
    move();

    expect(settings()).toEqual({
      general: { application: { openLinksInApp: false } },
      plugins: {
        'memo-pack/memos': { sort: 'newest' },
        // A built-in pack's keys are its own migration's to move, even when an external pack has the feature id too
        notes: { fontSize: 14 },
        _meta: { visibility: { 'memo-pack/memos': true, 'memo-pack/board': false, notes: false, 'host/packs': false }, lastActivePlugin: 'memo-pack/memos' },
      },
    });
  });

  it("moves a last-active host plugin onto the host's ref", () => {
    tx(SETTINGS_ID).put('data', { plugins: { _meta: { lastActivePlugin: 'packs' } } });

    move();

    expect(settings()).toEqual({ plugins: { _meta: { lastActivePlugin: 'host/packs' } } });
  });

  it('changes nothing when it runs again', () => {
    move();
    const moved = settings();

    move();

    expect(settings()).toEqual(moved);
  });

  it('does nothing without stored plugin settings', () => {
    tx(SETTINGS_ID).put('data', { general: {} });

    move();

    expect(settings()).toEqual({ general: {} });
  });
});
