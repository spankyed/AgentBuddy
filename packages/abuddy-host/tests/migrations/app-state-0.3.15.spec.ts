// The host's 0.3.15 app migration moves the app's state out of the built-in pack's settings (`internal`) into
// AppState: data from 0.3.14 comes back onboarded and at its version, so the migrations after it still run, on the
// release, its betas and development builds. A second run changes nothing, and a failed move runs no pack
// migration and records no version. The records it used to carry are dropped, since what says a pack's
// content has been applied is the per-item record only an apply can write.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { untypedTx, untypedQx } from '@abuddy/ears';
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
    // The stored pre-0.3.15 names: this is data in the old shape, and nothing reads them now
    packSeedHashes: { 'memo-pack': 'memo-hash' },
    seedHash: 'boot-hash',
    seedStatFingerprint: 'actions.content.json:1:2',
  },
};

const MOVED = {
  hasOnboarded: true,
  // Only written for a pack whose apply failed, and the move doesn't produce one
  failedAgainst: {},
  // The shell's state, which 0.3.14's settings here don't hold
  pluginVisibility: {},
};

const SETTINGS_ID = 'Settings-app' as EARS.EntityId;

function writeOldSettings(data: unknown = OLD_SETTINGS): void {
  untypedTx(SETTINGS_ID, true).put('entityType', 'Settings').put('data', data);
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
    // A boot apply: the single content revision 0.3.14 stored was this pack's
    migrations: { app: ['0.3.14', '0.3.16'].map((target) => ({ target, description: target, up: () => { ran.push(target); } })) },
  };
  // Registered straight into the registry: what this file is about is the migration runner, and routing
  // it through the loader would mean building a pack whose migrations close over this file's `ran`.
  // **With a `manifest`**, as every origin the loader builds has one: both lines are answered through the
  // packs' dependency order, which is read from their manifests, so an origin without one is in neither
  const builtInManifest = { id: BUILT_IN_ID, name: 'Built-in', version: TEST_APP_VERSION };
  registry.registerPack(registration, { ...builtInManifest, dir: packDir, shipped: true, manifest: builtInManifest as never });
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
  // The row kept a seed record per *kind* of pack — `packSeedHashes` for the installed ones against
  // `seedHashes` for the shipped one — and the names changed twice as those paths merged. None of them is
  // read any more: what says a pack's content has been applied is its `AppliedContent`, which holds a
  // revision *and* a hash per part of every item, and only an apply can write one. A bare hash carried onto
  // it would describe a pack that applied nothing, so the records are dropped and the first boot after this
  // applies each pack's content once.
  //
  // `externalSeedDeps` is the one that still moves: what a failed apply faced is still `failedAgainst`.
  /**
   * **The two attributes an apply stamps, on every entity in the database rather than on the registered
   * types.** A pack disabled or failing to load at this boot registers no entity types, so its types are
   * not types as far as the engine is concerned and a walk over the registered ones cannot see its
   * entities at all — and the migration records its version and never runs again. Its items would carry
   * the old names for good, which a later apply reads as entities carrying no hash of ours: left alone as
   * the user's, never updated again, which is the freeze 0.3.15 exists to end.
   */
  describe('the content key and hash an apply stamps', () => {
    const ofType = (type: string, id: string) => `${type}-${id}` as EARS.EntityId;

    it('are renamed on an entity whose type no registered pack declares', () => {
      const absent = ofType('MemoFromADisabledPack', 'one');
      untypedTx(absent, true).put('entityType', 'MemoFromADisabledPack');
      untypedTx(absent).update('seedKey', 'memo-pack:memos/one');
      untypedTx(absent).update('sourceHash', 'h1');
      expect(registry.getRegisteredEntityTypes(), 'the type is not one the engine knows').not.toContain('MemoFromADisabledPack');

      move();

      const row = untypedQx(absent).pickOne(['contentKey', 'contentHash', 'seedKey', 'sourceHash']) as Record<string, unknown>;
      expect(row.contentKey).toBe('memo-pack:memos/one');
      expect(row.contentHash).toBe('h1');
      expect(row.seedKey, 'and the old names are gone').toBeNull();
      expect(row.sourceHash).toBeNull();
    });

    /** A second run finds the new name already there and leaves it, which is what makes the rename free */
    it('are left alone by a later run, and an entity carrying neither is untouched', () => {
      const stamped = ofType('MemoFromADisabledPack', 'two');
      untypedTx(stamped, true).put('entityType', 'MemoFromADisabledPack');
      untypedTx(stamped).update('contentKey', 'memo-pack:memos/two');
      const theirs = ofType('MemoFromADisabledPack', 'three');
      untypedTx(theirs, true).put('entityType', 'MemoFromADisabledPack');
      untypedTx(theirs).update('title', 'mine');

      move();
      move();

      expect(untypedQx(stamped).pickOne(['contentKey'])?.contentKey).toBe('memo-pack:memos/two');
      expect(untypedQx(theirs).pickOne(['title', 'contentKey']) as Record<string, unknown>)
        .toMatchObject({ title: 'mine', contentKey: null });
    });
  });

  describe('the content records a row kept per kind of pack', () => {
    const APP_STATE_ID = 'AppState-app' as EARS.EntityId;
    const OLD = {
      packSeedHashes: { 'memo-pack': 'e1' },
      externalSeedDeps: { 'memo-pack': 'd1' },
      seedHashes: { 'default-setup': 'b1' },
      seedStatFingerprints: { 'default-setup': 'f1' },
      packSeedKeys: { 'default-setup': ['k1'] },
    };
    const writeOld = () => {
      const tx = untypedTx(APP_STATE_ID, true).put('entityType', 'AppState');
      for (const [k, v] of Object.entries(OLD)) tx.put(k, v);
    };

    it('moves what a failed apply faced onto the field that holds it now', () => {
      writeOld();

      move();

      expect(appState.get()).toMatchObject({ failedAgainst: { 'memo-pack': 'd1' } });
    });

    // Dropped rather than moved, and the row is what says so: a record carried onto a new name is one a
    // later reader will find and wonder about, where these have no reader left at all
    it('drops every record of what a pack last applyed, under each name it has had', () => {
      writeOld();
      untypedTx(APP_STATE_ID).put('builtInSeedFingerprints', { 'default-setup': 'f0' });
      untypedTx(APP_STATE_ID).put('builtInSeedHashes', { 'default-setup': 'b0' });

      move();

      const names = ['packSeedHashes', 'seedHashes', 'builtInSeedHashes', 'seedStatFingerprints', 'builtInSeedFingerprints', 'packSeedKeys'];
      const left = untypedQx(APP_STATE_ID).pickOne(names) as Record<string, unknown>;
      expect(names.length, 'the list of names to drop is empty, so this checks nothing').toBeGreaterThan(3);
      for (const name of names) expect(left[name], `${name} survived the move`).toBeNull();
      // And nothing of them reached the state the app reads
      expect(Object.keys(appState.get())).toEqual(expect.not.arrayContaining(names));
    });

    it('leaves the old names behind, so a second run finds nothing to move', () => {
      writeOld();
      move();
      const moved = appState.get();
      const update = vi.spyOn(appState, 'update');

      move();

      expect(update).not.toHaveBeenCalled();
      expect(appState.get()).toEqual(moved);
      // `drop` clears the attribute rather than removing the key, which is what the migration reads as "moved"
      const left = untypedQx(APP_STATE_ID).pickOne(Object.keys(OLD)) as Record<string, unknown>;
      expect(left.externalSeedDeps, 'the record that moved').toBeNull();
      expect(left.seedStatFingerprints, 'a record that was dropped').toBeNull();
    });

    // `appState.update` sets the whole field, so this is what the row holds when the move runs
    it('keeps what the new field already holds', () => {
      writeOld();
      appState.update({ failedAgainst: { 'memo-pack': 'newer' } });

      move();

      expect(appState.get().failedAgainst).toEqual({ 'memo-pack': 'newer' });
    });
  });

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
      internal: { hasOnboarded: false, version: '0.3.14', packVersions: { 'memo-pack': '1.0.0', 'old-pack': '0.1.0' } },
    });
    appState.update({ hasOnboarded: true, version: '0.3.15', packVersions: { 'memo-pack': '1.2.0' } });

    move();

    expect(appState.get()).toMatchObject({
      hasOnboarded: true,
      version: '0.3.15',
      packVersions: { 'memo-pack': '1.2.0', 'old-pack': '0.1.0' },
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
