// The host's 0.3.15 app migration moves the app's state out of the built-in pack's settings (`internal`) into
// AppState: data from 0.3.14 comes back onboarded, at its version (so the migrations after it still run), with its
// seed hashes, on the release, its betas and development builds. A second run changes nothing, and a failed move
// runs no pack migration and records no version.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { tx, untypedQx } from '@abuddy/ears';
import { resetTestData } from '@abuddy/sdk/testing';
import type { EARS } from '@abuddy/sdk';
import { registry, TEST_APP_VERSION } from '../packs/runtime/test-host.ts';

// The migrations runner reads the app environment; a test build runs release rules
process.env.ABUDDY_ENV = 'test';

/** The app version the runners read; the test host's unless a test sets one */
const version = vi.hoisted(() => ({ current: undefined as string | undefined }));
vi.mock('@abuddy/sdk/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@abuddy/sdk/env')>();
  return { ...actual, getAppVersion: () => version.current ?? actual.getAppVersion() };
});

import { appState } from '../../src/app-state/index.ts';
import { appMigrations } from '../../src/migrations/app/index.ts';
import { runAppMigrations, runPackMigrations } from '../../src/migrations/index.ts';
import { loadBuiltInPacks } from '../../src/packs/runtime/index.ts';
import type { PackMigrationTarget } from '../../src/migrations/index.ts';

const move = () => {
  const migration = appMigrations(registry).find((m) => m.target === '0.3.15');
  if (!migration) throw new Error('no 0.3.15 app migration');
  migration.up();
};

const BUILT_IN_ID = 'app-state-built-in';
/** The built-in and external packs' migrations that ran */
const ran: string[] = [];

/** An external pack at 2.0.0 whose 1.2.0 migration ran before (0.3.14 recorded it) */
const memoPack = {
  manifest: { id: 'memo-pack', version: '2.0.0' },
  migrations: ['1.2.0', '2.0.0'].map((target) => ({ target, description: target, up: () => { ran.push(`memo ${target}`); } })),
} satisfies PackMigrationTarget;

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

const MOVED = {
  hasOnboarded: true,
  packSeedHashes: { 'memo-pack': 'memo-hash' },
  // Only written for a pack whose seed failed, and the move doesn't produce one
  packSeedDeps: {},
  seedHashes: { [BUILT_IN_ID]: 'boot-hash' },
  seedStatFingerprints: { [BUILT_IN_ID]: 'actions.seed.json:1:2' },
};

const SETTINGS_ID = 'Settings-app' as EARS.EntityId;

function writeOldSettings(data: unknown = OLD_SETTINGS): void {
  tx(SETTINGS_ID, true).put('entityType', 'Settings').put('data', data);
}

/** What a boot runs: the app's migrations, then (unless they failed) the external packs' */
function migrate(): void {
  if (runAppMigrations(registry)) runPackMigrations([memoPack]);
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
    boot: { seedManifest: { seedKeys: ['actions'], compiledDir: packDir } },
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
  version.current = undefined;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env.ABUDDY_ENV = 'test';
});

describe('the 0.3.15 app migration', () => {
  it("moves the settings' internal section to AppState", () => {
    writeOldSettings();

    move();

    expect(appState.get()).toEqual({ ...MOVED, version: '0.3.14', packVersions: { 'memo-pack': '1.2.0' } });
    // The settings row is the pack's: its own migration drops the section
    expect(untypedQx(SETTINGS_ID).pickOne(['data'])?.data).toEqual(OLD_SETTINGS);
  });

  it('changes nothing when it runs again', () => {
    writeOldSettings();
    move();
    const moved = appState.get();
    const update = vi.spyOn(appState, 'update');

    move();

    expect(update).not.toHaveBeenCalled();
    expect(appState.get()).toEqual(moved);
  });

  it("keeps what AppState already records over the settings' older values", () => {
    writeOldSettings({
      internal: { hasOnboarded: false, version: '0.3.14', packVersions: { 'memo-pack': '1.0.0', 'old-pack': '0.1.0' }, seedHashes: { [BUILT_IN_ID]: 'older' } },
    });
    appState.update({ hasOnboarded: true, version: '0.3.15', packVersions: { 'memo-pack': '1.2.0' }, seedHashes: { [BUILT_IN_ID]: 'newer' } });

    move();

    expect(appState.get()).toMatchObject({
      hasOnboarded: true,
      version: '0.3.15',
      packVersions: { 'memo-pack': '1.2.0', 'old-pack': '0.1.0' },
      seedHashes: { [BUILT_IN_ID]: 'newer' },
    });
  });

  it('does nothing without old settings', () => {
    const update = vi.spyOn(appState, 'update');

    move();

    expect(update).not.toHaveBeenCalled();
    expect(appState.exists()).toBe(false);
  });
});

describe('migrating data from before AppState', () => {
  it("runs the pack migrations after the moved version, and records the app's", () => {
    writeOldSettings();

    migrate();

    expect(ran).toEqual(['0.3.16', 'memo 2.0.0']);
    expect(appState.get()).toEqual({ ...MOVED, version: TEST_APP_VERSION, packVersions: { 'memo-pack': '2.0.0' } });

    // Recorded: nothing runs again
    migrate();
    expect(ran).toEqual(['0.3.16', 'memo 2.0.0']);
  });

  it('runs no pack migration on new data, which is at the app version', () => {
    runAppMigrations(registry);

    expect(ran).toEqual([]);
    expect(appState.get()).toMatchObject({ hasOnboarded: false, version: TEST_APP_VERSION });
  });

  it("moves it on a beta of the release, without the later release's migrations or rerunning external ones", () => {
    version.current = '0.3.15-beta.0';
    writeOldSettings();

    migrate();

    expect(appState.get()).toEqual({ ...MOVED, version: '0.3.15-beta.0', packVersions: { 'memo-pack': '2.0.0' } });
    expect(ran).toEqual(['memo 2.0.0']);
  });

  it('moves it on a development build below the release', () => {
    process.env.ABUDDY_ENV = 'development';
    version.current = '0.3.14';
    writeOldSettings();

    migrate();

    expect(appState.get()).toEqual({ ...MOVED, version: '0.3.14', packVersions: { 'memo-pack': '2.0.0' } });
    // A development build runs the migrations written for later releases too
    expect(ran).toEqual(['0.3.16', 'memo 2.0.0']);
  });

  it('runs no pack migration and records no version when the move fails, so the next boot moves it', () => {
    writeOldSettings();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const update = vi.spyOn(appState, 'update').mockImplementation(() => { throw new Error('disk full'); });

    migrate();

    expect(ran).toEqual([]);
    expect(appState.exists()).toBe(false);
    update.mockRestore();

    migrate();

    expect(ran).toEqual(['0.3.16', 'memo 2.0.0']);
    expect(appState.get()).toMatchObject({ hasOnboarded: true, version: TEST_APP_VERSION, packVersions: { 'memo-pack': '2.0.0' } });
  });
});
