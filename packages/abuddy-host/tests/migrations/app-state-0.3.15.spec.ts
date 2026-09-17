// 0.3.15 moves the app's state out of the built-in pack's settings (`internal`) into AppState. Data from 0.3.14 comes
// back onboarded, at its version (so the migrations after it still run), with its seed hashes, and a second run changes
// nothing.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { tx, untypedQx } from '@abuddy/ears';
import { resetTestData } from '@abuddy/sdk/testing';
import type { EARS } from '@abuddy/sdk';
import { registry, TEST_APP_VERSION } from '../packs/runtime/test-host.ts';
import { appState } from '../../src/app-state/index.ts';
import { appMigrations } from '../../src/migrations/app/index.ts';
import { runAppMigrations } from '../../src/migrations/index.ts';
import { loadBuiltInPacks } from '../../src/packs/runtime/index.ts';

/** The migration as the host lists it, so this fails too if it was never listed */
const migration = appMigrations(registry).find((m) => m.target === '0.3.15')!;

const BUILT_IN_ID = 'app-state-built-in';
/** The built-in pack's migrations that ran */
const ran: string[] = [];

/** The settings row as 0.3.14 stored it: the user's changes, and the app's state in `internal` */
const OLD_SETTINGS = {
  general: { application: { openLinksInApp: false } },
  internal: {
    hasOnboarded: true,
    lastInteractionTimestamp: null,
    version: '0.3.14',
    packVersions: { 'memo-pack': '1.2.0' },
    packSeedHashes: { 'memo-pack': 'memo-hash' },
    seedHash: 'boot-hash',
    seedStatFingerprint: 'actions.seed.json:1:2',
  },
};

const SETTINGS_ID = 'Settings-app' as EARS.EntityId;

function writeOldSettings(data: unknown = OLD_SETTINGS): void {
  tx(SETTINGS_ID, true).put('entityType', 'Settings').put('data', data);
}

let builtInDir: string;

beforeAll(async () => {
  builtInDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-state-migration-'));
  const packDir = path.join(builtInDir, BUILT_IN_ID);
  fs.mkdirSync(packDir);
  fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({ id: BUILT_IN_ID, name: 'Built-in', version: TEST_APP_VERSION, builtIn: true }));
  const registration = {
    id: BUILT_IN_ID,
    systems: [],
    // A boot seed: the single seed hash of 0.3.14 was this pack's
    boot: { seedManifest: { artifacts: ['actions'], compiledDir: packDir } },
    migrations: ['0.3.14', '0.3.16'].map((target) => ({ target, description: target, up: () => { ran.push(target); } })),
  };
  await loadBuiltInPacks(registry, builtInDir, {
    runtimeEntry: 'never',
    bundledLoaders: async () => ({ [BUILT_IN_ID]: async () => ({ registration }) }),
  });
});

afterAll(() => {
  registry.unregisterPack(BUILT_IN_ID);
  fs.rmSync(builtInDir, { recursive: true, force: true });
});

beforeEach(() => {
  resetTestData();
  ran.length = 0;
  vi.restoreAllMocks();
});

describe('the 0.3.15 app migration', () => {
  it("moves the settings' internal section to AppState", () => {
    writeOldSettings();

    migration.up();

    expect(appState.get()).toEqual({
      hasOnboarded: true,
      version: '0.3.14',
      packVersions: { 'memo-pack': '1.2.0' },
      packSeedHashes: { 'memo-pack': 'memo-hash' },
      seedHashes: { [BUILT_IN_ID]: 'boot-hash' },
      seedStatFingerprints: { [BUILT_IN_ID]: 'actions.seed.json:1:2' },
    });
    // The settings row is the pack's: its own migration drops the section
    expect(untypedQx(SETTINGS_ID).pickOne(['data'])?.data).toEqual(OLD_SETTINGS);
  });

  it('changes nothing when it runs again', () => {
    writeOldSettings();
    migration.up();
    const moved = appState.get();
    const update = vi.spyOn(appState, 'update');

    migration.up();

    expect(update).not.toHaveBeenCalled();
    expect(appState.get()).toEqual(moved);
  });

  it("keeps what AppState already records over the settings' older values", () => {
    writeOldSettings({
      internal: { hasOnboarded: false, version: '0.3.14', packVersions: { 'memo-pack': '1.0.0', 'old-pack': '0.1.0' }, seedHashes: { [BUILT_IN_ID]: 'older' } },
    });
    appState.update({ hasOnboarded: true, version: '0.3.15', packVersions: { 'memo-pack': '1.2.0' }, seedHashes: { [BUILT_IN_ID]: 'newer' } });

    migration.up();

    expect(appState.get()).toMatchObject({
      hasOnboarded: true,
      version: '0.3.15',
      packVersions: { 'memo-pack': '1.2.0', 'old-pack': '0.1.0' },
      seedHashes: { [BUILT_IN_ID]: 'newer' },
    });
  });

  it('does nothing without old settings', () => {
    const update = vi.spyOn(appState, 'update');

    migration.up();

    expect(update).not.toHaveBeenCalled();
    expect(appState.exists()).toBe(false);
  });
});

describe('the migrations runner on data from before AppState', () => {
  it("runs the pack migrations after the moved version, and records the app's", () => {
    writeOldSettings();

    runAppMigrations(registry);

    expect(ran).toEqual(['0.3.16']);
    expect(appState.get()).toMatchObject({ hasOnboarded: true, version: TEST_APP_VERSION, seedHashes: { [BUILT_IN_ID]: 'boot-hash' } });

    // Recorded: nothing runs again
    runAppMigrations(registry);
    expect(ran).toEqual(['0.3.16']);
  });

  it('runs no pack migration on new data, which is at the app version', () => {
    runAppMigrations(registry);

    expect(ran).toEqual([]);
    expect(appState.get()).toMatchObject({ hasOnboarded: false, version: TEST_APP_VERSION });
  });
});
