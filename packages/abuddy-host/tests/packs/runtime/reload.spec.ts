// Reloading a pack loads and registers its rebuilt runtime before the running one shuts down: a rebuild that
// fails to load, or whose registration is refused, leaves the running pack as it was.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { registry } from './test-host.ts';
import { PACK_SNAPSHOT_FORMAT } from '@abuddy/sdk/build';
import { _appDirOf } from '@abuddy/sdk/env';
import { PACK_LAYOUT } from '../../../src/packs/layout.ts';

const { registerPack, unregisterPack, getPackRegistration, registerShutdownHook, removeShutdownHooksForKey } = registry;
const { reloadPackById } = await import('../../../src/packs/runtime/reload.ts');
const { loadAppPacks } = await import('../../../src/packs/runtime/loader.ts');
const { seedPacks } = await import('../../../src/packs/runtime/seed.ts');
const { resolveAppContext } = await import('@abuddy/sdk/env');
// The test host's logger reports through its root event bus, so a test can read what the code under test logged
const { testRootEvents: rootEvents, resetTestData, testPacks } = await import('@abuddy/sdk/testing');
const { appState } = await import('../../../src/app-state/index.ts');
const { readInstalledPacks } = await import('../../../src/packs/installed.ts');

const PACK_ID = 'reload-pack';

let tmpDir: string;
let origEnv: { env?: string; userDataDir?: string };
const running = { id: PACK_ID, features: { widget: { system: { machine: { id: 'widget', config: {} } as never, receives: ['PING'] } } } };
const bus = { send: vi.fn() };
const shutdown = vi.fn();

/** Writes the rebuilt pack: a pack layout whose runtime entry is `runtimeSource` */
function writeRebuild(runtimeSource: string) {
  const packDir = path.join(_appDirOf(tmpDir), 'packs', PACK_ID);
  fs.mkdirSync(path.join(packDir, 'runtime', 'seeds'), { recursive: true });
  fs.mkdirSync(path.join(packDir, 'types'), { recursive: true });
  fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({ id: PACK_ID, name: PACK_ID, version: '1.0.1' }));
  fs.writeFileSync(path.join(packDir, PACK_LAYOUT.integrity), JSON.stringify({ formatVersion: 1, id: PACK_ID, version: '1.0.1', files: {} }));
  fs.writeFileSync(path.join(packDir, PACK_LAYOUT.snapshot), JSON.stringify({ format: PACK_SNAPSHOT_FORMAT }));
  fs.writeFileSync(path.join(packDir, 'runtime', 'index.cjs'), runtimeSource);
}

const runtime = (services = '') => `
  module.exports = {
    registration: {
      id: '${PACK_ID}',
      features: { widget: { system: { machine: { id: 'widget', config: {} }, receives: ['PING'] } } },
      ${services}
    },
  };
`;

function expectRunningPackIntact() {
  expect(getPackRegistration(PACK_ID)?.features).toBe(running.features);
  expect(shutdown).not.toHaveBeenCalled();
  expect(bus.send).not.toHaveBeenCalled();
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-reload-'));
  origEnv = { env: process.env.ABUDDY_ENV, userDataDir: process.env.ABUDDY_USER_DATA_DIR };
  process.env.ABUDDY_ENV = 'test';
  process.env.ABUDDY_USER_DATA_DIR = tmpDir;
  bus.send.mockReset();
  shutdown.mockReset();
  registerPack(running);
  registerShutdownHook(shutdown, PACK_ID);
});

afterEach(() => {
  for (const id of [PACK_ID, 'service-owner']) {
    try { unregisterPack(id); } catch { /* not registered */ }
  }
  removeShutdownHooksForKey(PACK_ID);
  testPacks.seeders.delete('built-in-pack');
  for (const [key, value] of [['ABUDDY_ENV', origEnv.env], ['ABUDDY_USER_DATA_DIR', origEnv.userDataDir]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('reloading a pack the app ships', () => {
  const SHIPPED_ID = 'shipped-pack';
  const seeded: string[] = [];

  /**
   * A pack the app ships, installed as every pack is: its built runtime records the compiled dir it was
   * pointed at, reads it in its onInit, and it declares a seed over one compiled artifact
   */
  function writeShipped(manifest: Record<string, unknown> = {}): string {
    const packDir = path.join(_appDirOf(tmpDir), 'packs', SHIPPED_ID);
    fs.mkdirSync(path.join(packDir, 'runtime'), { recursive: true });
    fs.mkdirSync(path.join(packDir, 'types'), { recursive: true });
    fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({ id: SHIPPED_ID, name: SHIPPED_ID, version: '1.0.0', ...manifest }));
    fs.writeFileSync(path.join(packDir, PACK_LAYOUT.integrity), JSON.stringify({ formatVersion: 1, id: SHIPPED_ID, version: '1.0.0', files: {} }));
    fs.writeFileSync(path.join(packDir, PACK_LAYOUT.snapshot), JSON.stringify({ format: PACK_SNAPSHOT_FORMAT, types: {} }));
    writeSeeds('[{ "label": "first" }]');
    // The index naming the pack, and the runtime built beside it
    fs.writeFileSync(path.join(packDir, PACK_LAYOUT.seedsDir, 'seeds.json'), JSON.stringify({ version: 1, packId: SHIPPED_ID, seeds: [] }));
    fs.writeFileSync(path.join(packDir, 'runtime', 'index.cjs'), `
      let compiledDir = '';
      module.exports = {
        setCompiledDir(dir) { compiledDir = dir; },
        // Like a pack's generated seeders: the value is only there once the loader has set it
        getCompiledDir() {
          if (!compiledDir) throw new Error('compiledDir not initialized — pack loader must call setCompiledDir()');
          return compiledDir;
        },
        registration: {
          id: '${SHIPPED_ID}',
          features: { widget: { system: { machine: { id: 'widget', config: {} }, receives: ['PING'] } } },
          boot: {
            onInit() { module.exports.compiledDirAtInit = module.exports.getCompiledDir(); },
            seedManifest: { seedKeys: ['actions'], get compiledDir() { return module.exports.getCompiledDir(); } },
          },
        },
      };
    `);
    return packDir;
  }

  /** A pack's compiled seeds, where an installed pack holds them */
  function writeSeeds(content: string): void {
    const seedsDir = path.join(_appDirOf(tmpDir), 'packs', SHIPPED_ID, PACK_LAYOUT.seedsDir);
    fs.mkdirSync(seedsDir, { recursive: true });
    fs.writeFileSync(path.join(seedsDir, 'actions.seed.json'), content);
  }

  /** The pack as `seedPacks` takes it: a pack the app ships, with the policy its registration declares */
  const seedTarget = (packId: string = SHIPPED_ID) =>
    ({ manifest: { id: packId }, dir: path.join(_appDirOf(tmpDir), 'packs', SHIPPED_ID) });

  /** Records a seeder reports for the next seed instead of importing them (an invalid flow, say) */
  let recordsThatFail: string[] = [];
  /** Makes the seeder itself throw, as a rebuild removing its files mid-reload would */
  let seedFailure: Error | undefined;
  /** What the code under test logged at error level */
  const loggedErrors: string[] = [];
  let stopLogging: (() => void) | undefined;

  beforeEach(() => {
    seeded.length = 0;
    loggedErrors.length = 0;
    recordsThatFail = [];
    seedFailure = undefined;
    // The reason lives in meta: the app's logger redacts an Error into { name, message, stack }, the test host's passes it on
    stopLogging = rootEvents.onLog((event) => {
      if (event.level !== 'error') return;
      const meta: unknown = event.meta;
      loggedErrors.push(`${event.message} ${meta instanceof Error ? meta.message : JSON.stringify(meta ?? {})}`);
    });
    // AppState, where the boot seed records what it last seeded, starts empty
    resetTestData();
    // The seeders the built-in pack's registration carries
    testPacks.seeders.set(SHIPPED_ID, [{
      key: 'actions',
      // A seeder reports the records it couldn't seed in its counts; it doesn't throw
      apply: ({ compiledDir }) => {
        if (seedFailure) throw seedFailure;
        seeded.push(compiledDir);
        return { created: 1, updated: 0, skipped: recordsThatFail.length, ...(recordsThatFail.length > 0 && { errors: recordsThatFail }) };
      },
    }]);
  });

  it('points the rebuilt runtime at its compiled seeds, so onInit can read them', async () => {
    writeShipped();
    loadAppPacks(registry, new Set([SHIPPED_ID]));

    await reloadPackById(registry, SHIPPED_ID, bus as never);

    const packDir = path.join(_appDirOf(tmpDir), 'packs', SHIPPED_ID);
    const reloaded = require(path.join(packDir, 'runtime', 'index.cjs'));
    expect(reloaded.compiledDirAtInit).toBe(path.join(packDir, PACK_LAYOUT.seedsDir));
    expect(bus.send).toHaveBeenCalledWith({ type: 'RELOAD_PACK', packId: SHIPPED_ID, systemIds: [`${SHIPPED_ID}/widget`] });
  });

  // Only the reloaded pack's own systems restart; other packs' systems read what it registers and seeds
  it('tells the running systems the pack changed, after restarting its own', async () => {
    writeShipped();
    loadAppPacks(registry, new Set([SHIPPED_ID]));

    await reloadPackById(registry, SHIPPED_ID, bus as never);

    expect(bus.send.mock.calls.map(([event]) => event.type)).toEqual(['RELOAD_PACK', 'PACK_CHANGED']);
    expect(bus.send).toHaveBeenCalledWith({ type: 'PACK_CHANGED', packId: SHIPPED_ID });
  });

  it('seeds the compiled data a rebuild changed, and leaves unchanged data alone', async () => {
    writeShipped();
    loadAppPacks(registry, new Set([SHIPPED_ID]));
    // Boot's own seeding, which the reload picks up from
    seedPacks([seedTarget()]);
    expect(seeded).toEqual([path.join(_appDirOf(tmpDir), 'packs', SHIPPED_ID, PACK_LAYOUT.seedsDir)]);

    // A reload after a code-only rebuild leaves the data alone
    seeded.length = 0;
    await reloadPackById(registry, SHIPPED_ID, bus as never);
    expect(seeded).toEqual([]);

    // A reload carrying recompiled seeds imports them
    writeSeeds('[{ "label": "second" }]');
    await reloadPackById(registry, SHIPPED_ID, bus as never);
    expect(seeded).toEqual([path.join(_appDirOf(tmpDir), 'packs', SHIPPED_ID, PACK_LAYOUT.seedsDir)]);
  });

  it("records what it seeded per pack, so a second shipped pack's boot seed doesn't re-run this one", async () => {
    writeShipped();
    loadAppPacks(registry, new Set([SHIPPED_ID]));
    seedPacks([seedTarget()]);
    expect(seeded).toEqual([path.join(_appDirOf(tmpDir), 'packs', SHIPPED_ID, PACK_LAYOUT.seedsDir)]);

    // Another pack the app ships seeds its own data, recorded in the same AppState row
    seeded.length = 0;
    seedPacks([seedTarget('other-pack')]);
    expect(Object.keys(appState.get().packSeedHashes).sort()).toEqual([SHIPPED_ID, 'other-pack'].sort());

    // ...and this pack's own seed is still recorded, so it isn't seeded again
    seeded.length = 0;
    seedPacks([seedTarget()]);
    expect(seeded).toEqual([]);
  });

  it('reports the records a seeder could not seed, and still records the hash so they are retried on the next change', async () => {
    writeShipped();
    loadAppPacks(registry, new Set([SHIPPED_ID]));
    recordsThatFail = ['Flow "Broken": step 2 names no action'];
    seedPacks([seedTarget()]);

    // The failure is reported, not swallowed behind "Boot seed completed"
    expect(loggedErrors.join('\n')).toContain('Flow "Broken": step 2 names no action');
    // The hash is stored anyway, as importPackSeeds does: the same failing data isn't re-imported every boot
    expect(appState.get().packSeedHashes[SHIPPED_ID]).toBeTruthy();

    // ...and the next seed of unchanged data doesn't retry it
    seeded.length = 0;
    seedPacks([seedTarget()]);
    expect(seeded).toEqual([]);

    // ...while recompiled seeds do
    writeSeeds('[{ "label": "second" }]');
    recordsThatFail = [];
    loggedErrors.length = 0;
    seedPacks([seedTarget()]);
    expect(seeded).toEqual([path.join(_appDirOf(tmpDir), 'packs', SHIPPED_ID, PACK_LAYOUT.seedsDir)]);
    expect(loggedErrors).toEqual([]);
  });

  it('still restarts the systems when the seed after registering throws, and says why', async () => {
    writeShipped();
    loadAppPacks(registry, new Set([SHIPPED_ID]));
    bus.send.mockClear();

    // A rebuild running again mid-reload takes the compiled seeds out from under the seeder
    seedFailure = new Error("ENOENT: no such file or directory, open 'actions.seed.json'");
    await reloadPackById(registry, SHIPPED_ID, bus as never);

    // The swap already happened, so the systems have to be restarted whatever the seed did
    expect(bus.send).toHaveBeenCalledWith({ type: 'RELOAD_PACK', packId: SHIPPED_ID, systemIds: [`${SHIPPED_ID}/widget`] });
    expect(loggedErrors.join('\n')).toContain('ENOENT');
  });

  // A rebuild can change the pack's version, and the list the Packs view shows reads the origin
  it("re-reads the pack's manifest, so a version a rebuild changed is the one listed", async () => {
    writeShipped();
    loadAppPacks(registry, new Set([SHIPPED_ID]));
    expect(registry.packOrigin(SHIPPED_ID)?.version).toBe('1.0.0');

    writeShipped({ version: '2.0.0' });
    await reloadPackById(registry, SHIPPED_ID, bus as never);

    expect(registry.packOrigin(SHIPPED_ID)?.version).toBe('2.0.0');
  });

  afterEach(() => {
    stopLogging?.();
    stopLogging = undefined;
    try { unregisterPack(SHIPPED_ID); } catch { /* not registered */ }
  });
});

describe('reloading a pack', () => {
  it('leaves the running pack intact when the rebuilt runtime throws while loading', async () => {
    writeRebuild(`throw new Error('broken build');`);
    await expect(reloadPackById(registry, PACK_ID, bus as never)).rejects.toThrow(`Failed to load pack ${PACK_ID}`);
    expectRunningPackIntact();
  });

  it('leaves the running pack intact when the rebuilt runtime exports no registration', async () => {
    writeRebuild(`module.exports = {};`);
    await expect(reloadPackById(registry, PACK_ID, bus as never)).rejects.toThrow(`Failed to load pack ${PACK_ID}`);
    expectRunningPackIntact();
  });

  // Its origin too: without it the registry forgets where the pack came from, and a built-in's next reload can't find it
  it('restores the running registration, and where it came from, when the rebuilt one is refused', async () => {
    const origin = { id: PACK_ID, name: PACK_ID, version: '1.0.0', dir: path.join(_appDirOf(tmpDir), 'packs', PACK_ID), shipped: false };
    unregisterPack(PACK_ID);
    registerPack(running, origin);
    registerPack({ id: 'service-owner', services: { taken: {} } });
    writeRebuild(runtime(`services: { taken: {} },`));
    await expect(reloadPackById(registry, PACK_ID, bus as never)).rejects.toThrow(`Failed to register pack ${PACK_ID}`);
    expectRunningPackIntact();
    expect(registry.packOrigin(PACK_ID)).toEqual(origin);
  });

  // A pack the app is the first to load has no row in installed-packs.json, and a seed failure still has
  // to reach it: the row is made when there is something to record on it.
  it("records a first-time pack's seed failure", async () => {
    resetTestData();
    writeRebuild(runtime());
    // Compiled seeds from a pack built by an older CLI: importCompiledSeeds refuses them, which is a failed seed
    fs.writeFileSync(
      path.join(_appDirOf(tmpDir), 'packs', PACK_ID, 'runtime', 'seeds', 'seeds.json'),
      JSON.stringify({ version: 1, seeds: [] }),
    );

    await reloadPackById(registry, PACK_ID, bus as never);

    expect(readInstalledPacks()).toMatchObject([
      expect.objectContaining({ id: PACK_ID, lastError: expect.stringContaining("doesn't name the pack that compiled these seeds") }),
    ]);
  });

  // A pack that seeds cleanly and has decided nothing keeps no row: the packs directory is what makes it
  // installed, so there is nothing for the record to say about it.
  it('leaves no row behind for a pack whose seed had nothing to report', async () => {
    resetTestData();
    writeRebuild(runtime());

    await reloadPackById(registry, PACK_ID, bus as never);

    expect(fs.existsSync(resolveAppContext().installedPacksFile), 'no record was written at all').toBe(false);
  });

  it('shuts the running pack down and restarts its systems once the rebuild is registered', async () => {
    writeRebuild(runtime());
    await reloadPackById(registry, PACK_ID, bus as never);

    expect(getPackRegistration(PACK_ID)?.features).not.toBe(running.features);
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(bus.send).toHaveBeenCalledWith({ type: 'RELOAD_PACK', packId: PACK_ID, systemIds: [`${PACK_ID}/widget`] });
  });

  it("runs the rebuilt pack's new migrations against the version it recorded", async () => {
    resetTestData();
    appState.update({ packVersions: { [PACK_ID]: '1.0.0' } });
    const ran: string[] = [];
    Object.assign(globalThis, { reloadPackRuns: ran });
    writeRebuild(runtime(`migrations: ['1.0.0', '1.0.1'].map((target) => ({ target, description: target, up: () => globalThis.reloadPackRuns.push(target) })),`));

    await reloadPackById(registry, PACK_ID, bus as never);

    expect(ran).toEqual(['1.0.1']);
    expect(appState.get().packVersions).toEqual({ [PACK_ID]: '1.0.1' });
  });

  // Other packs' systems read what the pack registers and seeds (the chat's slash commands, say). A system
  // reading it between unregistering the running pack and registering the rebuild would find nothing
  it('tells the running systems the pack changed once the rebuild is registered and its systems restarted', async () => {
    writeRebuild(runtime());
    const registrationWhenSent: unknown[] = [];
    bus.send.mockImplementation((event: { type: string }) => {
      if (event.type === 'PACK_CHANGED') registrationWhenSent.push(getPackRegistration(PACK_ID)?.features);
    });
    await reloadPackById(registry, PACK_ID, bus as never);

    expect(bus.send.mock.calls.map(([event]) => event.type)).toEqual(['RELOAD_PACK', 'PACK_CHANGED']);
    expect(bus.send).toHaveBeenCalledWith({ type: 'PACK_CHANGED', packId: PACK_ID });
    expect(registrationWhenSent).toHaveLength(1);
    expect(registrationWhenSent[0]).toBeDefined();
    expect(registrationWhenSent[0]).not.toBe(running.features);
  });
});
