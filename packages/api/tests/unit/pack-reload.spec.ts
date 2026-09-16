// Reloading a pack loads and registers its rebuilt runtime before the running one shuts down: a rebuild that
// fails to load, or whose registration is refused, leaves the running pack as it was.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { registerHostModule } from '@abuddy/sdk/runtime';

vi.mock('virtual:built-in-pack-loaders', () => ({ default: {} }));
vi.mock('@/core/ears/attribute-storage', () => ({ invalidatePartitionPolicy: () => {} }));
vi.mock('@abuddy/host/settings', () => ({
  settingsRepository: {
    settingsQueries: { getInternalSettings: () => ({ packSeedHashes: {} }) },
    settingsCommands: { updateSettings: () => {} },
  },
}));

const noop = () => {};
registerHostModule('logger', { createLogger: () => ({ debug: noop, info: noop, warn: noop, error: noop }), LogEvent: {} });

const { registerPack, unregisterPack, getPackRegistration, publishHostPackArtifacts } = await import('@abuddy/host/packs');
const { registerRepository } = await import('@abuddy/sdk/ears');
const { registerSeeder } = await import('@abuddy/sdk/utils');
const { registerShutdownHook, removeShutdownHooksForKey } = await import('@abuddy/sdk/utils');
const { reloadExternalPack, reloadBuiltInPack } = await import('@/packs/pack-reload');
const { loadBuiltInPacks, getBuiltInPackInfos } = await import('@/packs/pack-loader');
const { orchestrateDeclarativeSeed } = await import('@/packs/pack-seed');
const { getPackBootHooks } = await import('@abuddy/host/packs');
const { resolveAppContext } = await import('@abuddy/sdk/env');
// The API's logger reports through rootEvents, so a test can read what the code under test logged
const { rootEvents } = await import('@/core/router/bus-emitter');

const PACK_ID = 'reload-pack';

let tmpDir: string;
let origEnv: { env?: string; userDataDir?: string };
const running = { id: PACK_ID, systems: [{ id: `${PACK_ID}.widget`, machine: { id: 'widget', config: {} } as never, events: new Set(['PING']) }] };
const bus = { send: vi.fn() };
const shutdown = vi.fn();

/** Writes the rebuilt pack: a bundle whose runtime entry is `runtimeSource` */
function writeRebuild(runtimeSource: string) {
  const packDir = path.join(tmpDir, 'packs', PACK_ID);
  fs.mkdirSync(path.join(packDir, 'runtime', 'seeds'), { recursive: true });
  fs.mkdirSync(path.join(packDir, 'types'), { recursive: true });
  fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({ id: PACK_ID, name: PACK_ID, version: '1.0.1' }));
  fs.writeFileSync(path.join(packDir, 'bundle.json'), JSON.stringify({ formatVersion: 1, id: PACK_ID, version: '1.0.1', files: {} }));
  fs.writeFileSync(path.join(packDir, 'types', 'snapshot.json'), '{}');
  fs.writeFileSync(path.join(packDir, 'runtime', 'index.cjs'), runtimeSource);
}

const runtime = (services = '') => `
  module.exports = {
    registration: {
      id: '${PACK_ID}',
      systems: [{ id: 'widget', machine: { id: 'widget', config: {} }, events: new Set(['PING']) }],
      ${services}
    },
  };
`;

function expectRunningPackIntact() {
  expect(getPackRegistration(PACK_ID)?.systems).toBe(running.systems);
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
  for (const [key, value] of [['ABUDDY_ENV', origEnv.env], ['ABUDDY_USER_DATA_DIR', origEnv.userDataDir]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('reloading a built-in pack', () => {
  const BUILT_IN_ID = 'built-in-pack';
  /** The pack's internal settings, where the boot seed records what it last seeded */
  let internalSettings: Record<string, unknown>;
  const seeded: string[] = [];

  /**
   * A built-in pack whose built runtime records the compiled dir it was pointed at, reads it in its
   * onInit, and declares a boot seed over one compiled artifact
   */
  function writeBuiltIn(manifest: Record<string, unknown> = {}): string {
    const packagesDir = path.join(tmpDir, 'packages');
    const packDir = path.join(packagesDir, BUILT_IN_ID);
    fs.mkdirSync(path.join(packDir, 'dist', 'runtime'), { recursive: true });
    fs.mkdirSync(path.join(packDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({ id: BUILT_IN_ID, name: BUILT_IN_ID, version: '1.0.0', builtIn: true, ...manifest }));
    fs.writeFileSync(path.join(packDir, 'dist', 'snapshot.json'), '{"types":{}}');
    writeSeeds('[{ "label": "first" }]');
    fs.writeFileSync(path.join(packDir, 'dist', 'runtime', 'index.cjs'), `
      let compiledDir = '';
      module.exports = {
        setCompiledDir(dir) { compiledDir = dir; },
        // Like a pack's generated seeders: the value is only there once the loader has set it
        getCompiledDir() {
          if (!compiledDir) throw new Error('compiledDir not initialized — pack loader must call setCompiledDir()');
          return compiledDir;
        },
        registration: {
          id: '${BUILT_IN_ID}',
          systems: [{ id: 'widget', machine: { id: 'widget', config: {} }, events: new Set(['PING']) }],
          boot: {
            onInit() { module.exports.compiledDirAtInit = module.exports.getCompiledDir(); },
            seedManifest: { artifacts: ['actions'], get compiledDir() { return module.exports.getCompiledDir(); } },
          },
        },
      };
    `);
    return packagesDir;
  }

  function writeSeeds(content: string): void {
    fs.writeFileSync(path.join(tmpDir, 'packages', BUILT_IN_ID, 'dist', 'actions.seed.json'), content);
  }

  /** Records a seeder reports for the next seed instead of importing them (an invalid flow, say) */
  let recordsThatFail: string[] = [];
  /** Makes the boot seed itself throw, as a rebuild removing its files mid-reload would */
  let seedFailure: Error | undefined;
  /** What the code under test logged at error level */
  const loggedErrors: string[] = [];
  let stopLogging: (() => void) | undefined;

  beforeEach(() => {
    seeded.length = 0;
    loggedErrors.length = 0;
    recordsThatFail = [];
    seedFailure = undefined;
    stopLogging = rootEvents.onLog((event) => { if (event.level === 'error') loggedErrors.push(event.message); });
    internalSettings = {};
    registerSeeder({
      key: 'actions',
      // A seeder reports the records it couldn't seed in its counts; it doesn't throw
      seed: ({ compiledDir }) => {
        seeded.push(compiledDir);
        return { created: 1, updated: 0, skipped: recordsThatFail.length, ...(recordsThatFail.length > 0 && { errors: recordsThatFail }) };
      },
    });
    registerRepository('settingsQueries', {
      getInternalSettings: () => {
        if (seedFailure) throw seedFailure;
        return internalSettings;
      },
    });
    registerRepository('settingsCommands', {
      updateSettings: (_scope: string, _label: string | null, path: string[], value: unknown) => { internalSettings[path[0]] = value; },
    });
  });

  it('points the rebuilt runtime at its compiled seeds, so onInit can read them', async () => {
    const packagesDir = writeBuiltIn();
    await loadBuiltInPacks(packagesDir, { runtimeEntry: 'only' });

    await reloadBuiltInPack(BUILT_IN_ID, bus as never);

    const packDir = path.join(packagesDir, BUILT_IN_ID);
    const reloaded = require(path.join(packDir, 'dist', 'runtime', 'index.cjs'));
    expect(reloaded.compiledDirAtInit).toBe(path.join(packDir, 'dist'));
    expect(bus.send).toHaveBeenCalledWith({ type: 'RELOAD_PACK', packId: BUILT_IN_ID, systemIds: ['widget'] });
  });

  it('seeds the compiled data a rebuild changed, and leaves unchanged data alone', async () => {
    const packagesDir = writeBuiltIn();
    await loadBuiltInPacks(packagesDir, { runtimeEntry: 'only' });
    // Boot's own seeding, which the reload picks up from
    const { seedManifest } = getPackBootHooks(BUILT_IN_ID)!;
    orchestrateDeclarativeSeed(seedManifest!, BUILT_IN_ID);
    expect(seeded).toEqual([path.join(packagesDir, BUILT_IN_ID, 'dist')]);

    // A reload after a code-only rebuild leaves the data alone
    seeded.length = 0;
    await reloadBuiltInPack(BUILT_IN_ID, bus as never);
    expect(seeded).toEqual([]);

    // A reload carrying recompiled seeds imports them
    writeSeeds('[{ "label": "second" }]');
    await reloadBuiltInPack(BUILT_IN_ID, bus as never);
    expect(seeded).toEqual([path.join(packagesDir, BUILT_IN_ID, 'dist')]);
  });

  it("records what it seeded per pack, so a second built-in pack's boot seed doesn't re-run this one", async () => {
    const packagesDir = writeBuiltIn();
    await loadBuiltInPacks(packagesDir, { runtimeEntry: 'only' });
    const { seedManifest } = getPackBootHooks(BUILT_IN_ID)!;

    orchestrateDeclarativeSeed(seedManifest!, BUILT_IN_ID);
    expect(seeded).toEqual([path.join(packagesDir, BUILT_IN_ID, 'dist')]);

    // Another built-in pack seeds its own data from the same settings row
    seeded.length = 0;
    orchestrateDeclarativeSeed(seedManifest!, 'other-pack');
    expect(Object.keys(internalSettings.seedHashes as Record<string, string>).sort()).toEqual([BUILT_IN_ID, 'other-pack']);

    // ...and this pack's own seed is still recorded, so it isn't seeded again
    seeded.length = 0;
    orchestrateDeclarativeSeed(seedManifest!, BUILT_IN_ID);
    expect(seeded).toEqual([]);
  });

  it('reports the records a seeder could not seed, and still records the hash so they are retried on the next change', async () => {
    const packagesDir = writeBuiltIn();
    await loadBuiltInPacks(packagesDir, { runtimeEntry: 'only' });
    const { seedManifest } = getPackBootHooks(BUILT_IN_ID)!;

    recordsThatFail = ['Flow "Broken": step 2 names no action'];
    orchestrateDeclarativeSeed(seedManifest!, BUILT_IN_ID);

    // The failure is reported, not swallowed behind "Boot seed completed"
    expect(loggedErrors.join('\n')).toContain('Flow "Broken": step 2 names no action');
    // The hash is stored anyway, as seedPackData does: the same failing data isn't re-imported every boot
    expect((internalSettings.seedHashes as Record<string, string>)[BUILT_IN_ID]).toBeTruthy();

    // ...and the next seed of unchanged data doesn't retry it
    seeded.length = 0;
    orchestrateDeclarativeSeed(seedManifest!, BUILT_IN_ID);
    expect(seeded).toEqual([]);

    // ...while recompiled seeds do
    writeSeeds('[{ "label": "second" }]');
    recordsThatFail = [];
    loggedErrors.length = 0;
    orchestrateDeclarativeSeed(seedManifest!, BUILT_IN_ID);
    expect(seeded).toEqual([path.join(packagesDir, BUILT_IN_ID, 'dist')]);
    expect(loggedErrors).toEqual([]);
  });

  it('still restarts the systems when the seed after registering throws, and says why', async () => {
    const packagesDir = writeBuiltIn();
    await loadBuiltInPacks(packagesDir, { runtimeEntry: 'only' });
    bus.send.mockClear();

    // A rebuild running again mid-reload takes the compiled seeds out from under it
    seedFailure = new Error("ENOENT: no such file or directory, open 'actions.seed.json'");
    await reloadBuiltInPack(BUILT_IN_ID, bus as never);

    // The swap already happened, so the systems have to be restarted whatever the seed did
    expect(bus.send).toHaveBeenCalledWith({ type: 'RELOAD_PACK', packId: BUILT_IN_ID, systemIds: ['widget'] });
    expect(loggedErrors.join('\n')).toContain('ENOENT');
    // ...and the artifacts are still published, which the seed used to skip on its way out
    const { hostPacksDir } = resolveAppContext();
    expect(fs.existsSync(path.join(hostPacksDir, BUILT_IN_ID, 'types', 'snapshot.json'))).toBe(true);
  });

  it("republishes the pack's build artifacts and re-reads its manifest", async () => {
    const packagesDir = writeBuiltIn();
    await loadBuiltInPacks(packagesDir, { runtimeEntry: 'only' });
    const { hostPacksDir } = resolveAppContext();
    publishHostPackArtifacts(path.join(packagesDir, BUILT_IN_ID), path.join(hostPacksDir, BUILT_IN_ID));

    // The rebuild changes the pack's version and its published types
    writeBuiltIn({ version: '2.0.0' });
    fs.writeFileSync(path.join(packagesDir, BUILT_IN_ID, 'dist', 'snapshot.json'), '{"types":{"Widget":"Widget"}}');

    await reloadBuiltInPack(BUILT_IN_ID, bus as never);

    expect(fs.readFileSync(path.join(hostPacksDir, BUILT_IN_ID, 'types', 'snapshot.json'), 'utf-8')).toContain('Widget');
    expect(getBuiltInPackInfos().find(p => p.id === BUILT_IN_ID)?.version).toBe('2.0.0');
  });

  afterEach(() => {
    stopLogging?.();
    stopLogging = undefined;
    try { unregisterPack(BUILT_IN_ID); } catch { /* not registered */ }
  });
});

describe('reloading a pack', () => {
  it('leaves the running pack intact when the rebuilt runtime throws while loading', async () => {
    writeRebuild(`throw new Error('broken build');`);
    await expect(reloadExternalPack(PACK_ID, bus as never)).rejects.toThrow(`Failed to load pack ${PACK_ID}`);
    expectRunningPackIntact();
  });

  it('leaves the running pack intact when the rebuilt runtime exports no registration', async () => {
    writeRebuild(`module.exports = {};`);
    await expect(reloadExternalPack(PACK_ID, bus as never)).rejects.toThrow(`Failed to load pack ${PACK_ID}`);
    expectRunningPackIntact();
  });

  it('restores the running registration when the rebuilt one is refused', async () => {
    registerPack({ id: 'service-owner', systems: [], services: { taken: {} } });
    writeRebuild(runtime(`services: { taken: {} },`));
    await expect(reloadExternalPack(PACK_ID, bus as never)).rejects.toThrow(`Failed to register pack ${PACK_ID}`);
    expectRunningPackIntact();
  });

  it('shuts the running pack down and restarts its systems once the rebuild is registered', async () => {
    writeRebuild(runtime());
    await reloadExternalPack(PACK_ID, bus as never);

    expect(getPackRegistration(PACK_ID)?.systems).not.toBe(running.systems);
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(bus.send).toHaveBeenCalledWith({ type: 'RELOAD_PACK', packId: PACK_ID, systemIds: [`${PACK_ID}.widget`] });
  });
});
