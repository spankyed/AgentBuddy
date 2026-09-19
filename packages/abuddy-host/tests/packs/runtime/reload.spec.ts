// Reloading a pack loads and registers its rebuilt runtime before the running one shuts down: a rebuild that
// fails to load, or whose registration is refused, leaves the running pack as it was.
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { registry } from './test-host.ts';

const { publishHostPackOutput } = await import('../../../src/packs/index.ts');
const { registerPack, unregisterPack, getPackRegistration, getPackBootHooks, registerShutdownHook, removeShutdownHooksForKey } = registry;
const { reloadExternalPack, reloadBuiltInPack } = await import('../../../src/packs/runtime/reload.ts');
const { loadBuiltInPacks } = await import('../../../src/packs/runtime/loader.ts');
const { getBuiltInPackInfos } = await import('../../../src/packs/runtime/loaded-packs.ts');
const { orchestrateDeclarativeSeed } = await import('../../../src/packs/runtime/seed.ts');
const { resolveAppContext } = await import('@abuddy/sdk/env');
// The test host's logger reports through its root event bus, so a test can read what the code under test logged
const { testRootEvents: rootEvents, resetTestData, testPacks } = await import('@abuddy/sdk/testing');
const { appState } = await import('../../../src/app-state/index.ts');

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
  testPacks.seeders.delete('built-in-pack');
  for (const [key, value] of [['ABUDDY_ENV', origEnv.env], ['ABUDDY_USER_DATA_DIR', origEnv.userDataDir]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('reloading a built-in pack', () => {
  const BUILT_IN_ID = 'built-in-pack';
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
    // The index naming the pack, and the runtime built beside it
    const seedsIndex = JSON.stringify({ version: 1, packId: BUILT_IN_ID, seeds: [] });
    fs.writeFileSync(path.join(packDir, 'dist', 'seeds.json'), seedsIndex);
    fs.writeFileSync(path.join(packDir, 'dist', 'runtime', 'seeds-index.sha256'), createHash('sha256').update(seedsIndex).digest('hex'));
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
            seedManifest: { seedKeys: ['actions'], get compiledDir() { return module.exports.getCompiledDir(); } },
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
    testPacks.seeders.set(BUILT_IN_ID, [{
      key: 'actions',
      // A seeder reports the records it couldn't seed in its counts; it doesn't throw
      seed: ({ compiledDir }) => {
        if (seedFailure) throw seedFailure;
        seeded.push(compiledDir);
        return { created: 1, updated: 0, skipped: recordsThatFail.length, ...(recordsThatFail.length > 0 && { errors: recordsThatFail }) };
      },
    }]);
  });

  it('points the rebuilt runtime at its compiled seeds, so onInit can read them', async () => {
    const packagesDir = writeBuiltIn();
    await loadBuiltInPacks(registry, packagesDir, { runtimeEntry: 'only' });

    await reloadBuiltInPack(registry, BUILT_IN_ID, bus as never);

    const packDir = path.join(packagesDir, BUILT_IN_ID);
    const reloaded = require(path.join(packDir, 'dist', 'runtime', 'index.cjs'));
    expect(reloaded.compiledDirAtInit).toBe(path.join(packDir, 'dist'));
    expect(bus.send).toHaveBeenCalledWith({ type: 'RELOAD_PACK', packId: BUILT_IN_ID, systemIds: ['widget'] });
  });

  // Only the reloaded pack's own systems restart; other packs' systems read what it registers and seeds
  it('tells the running systems the pack changed, after restarting its own', async () => {
    const packagesDir = writeBuiltIn();
    await loadBuiltInPacks(registry, packagesDir, { runtimeEntry: 'only' });

    await reloadBuiltInPack(registry, BUILT_IN_ID, bus as never);

    expect(bus.send.mock.calls.map(([event]) => event.type)).toEqual(['RELOAD_PACK', 'PACK_CHANGED']);
    expect(bus.send).toHaveBeenCalledWith({ type: 'PACK_CHANGED', packId: BUILT_IN_ID });
  });

  it('seeds the compiled data a rebuild changed, and leaves unchanged data alone', async () => {
    const packagesDir = writeBuiltIn();
    await loadBuiltInPacks(registry, packagesDir, { runtimeEntry: 'only' });
    // Boot's own seeding, which the reload picks up from
    const { seedManifest } = getPackBootHooks(BUILT_IN_ID)!;
    orchestrateDeclarativeSeed(seedManifest!, BUILT_IN_ID);
    expect(seeded).toEqual([path.join(packagesDir, BUILT_IN_ID, 'dist')]);

    // A reload after a code-only rebuild leaves the data alone
    seeded.length = 0;
    await reloadBuiltInPack(registry, BUILT_IN_ID, bus as never);
    expect(seeded).toEqual([]);

    // A reload carrying recompiled seeds imports them
    writeSeeds('[{ "label": "second" }]');
    await reloadBuiltInPack(registry, BUILT_IN_ID, bus as never);
    expect(seeded).toEqual([path.join(packagesDir, BUILT_IN_ID, 'dist')]);
  });

  it("records what it seeded per pack, so a second built-in pack's boot seed doesn't re-run this one", async () => {
    const packagesDir = writeBuiltIn();
    await loadBuiltInPacks(registry, packagesDir, { runtimeEntry: 'only' });
    const { seedManifest } = getPackBootHooks(BUILT_IN_ID)!;

    orchestrateDeclarativeSeed(seedManifest!, BUILT_IN_ID);
    expect(seeded).toEqual([path.join(packagesDir, BUILT_IN_ID, 'dist')]);

    // Another built-in pack seeds its own data, recorded in the same AppState row
    seeded.length = 0;
    orchestrateDeclarativeSeed(seedManifest!, 'other-pack');
    expect(Object.keys(appState.get().seedHashes).sort()).toEqual([BUILT_IN_ID, 'other-pack']);

    // ...and this pack's own seed is still recorded, so it isn't seeded again
    seeded.length = 0;
    orchestrateDeclarativeSeed(seedManifest!, BUILT_IN_ID);
    expect(seeded).toEqual([]);
  });

  it('reports the records a seeder could not seed, and still records the hash so they are retried on the next change', async () => {
    const packagesDir = writeBuiltIn();
    await loadBuiltInPacks(registry, packagesDir, { runtimeEntry: 'only' });
    const { seedManifest } = getPackBootHooks(BUILT_IN_ID)!;

    recordsThatFail = ['Flow "Broken": step 2 names no action'];
    orchestrateDeclarativeSeed(seedManifest!, BUILT_IN_ID);

    // The failure is reported, not swallowed behind "Boot seed completed"
    expect(loggedErrors.join('\n')).toContain('Flow "Broken": step 2 names no action');
    // The hash is stored anyway, as seedPackData does: the same failing data isn't re-imported every boot
    expect(appState.get().seedHashes[BUILT_IN_ID]).toBeTruthy();

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
    await loadBuiltInPacks(registry, packagesDir, { runtimeEntry: 'only' });
    bus.send.mockClear();

    // A rebuild running again mid-reload takes the compiled seeds out from under the seeder
    seedFailure = new Error("ENOENT: no such file or directory, open 'actions.seed.json'");
    await reloadBuiltInPack(registry, BUILT_IN_ID, bus as never);

    // The swap already happened, so the systems have to be restarted whatever the seed did
    expect(bus.send).toHaveBeenCalledWith({ type: 'RELOAD_PACK', packId: BUILT_IN_ID, systemIds: ['widget'] });
    expect(loggedErrors.join('\n')).toContain('ENOENT');
    // ...and the artifacts are still published, which the seed used to skip on its way out
    const { hostPacksDir } = resolveAppContext();
    expect(fs.existsSync(path.join(hostPacksDir, BUILT_IN_ID, 'types', 'snapshot.json'))).toBe(true);
  });

  it("republishes the pack's build output and re-reads its manifest", async () => {
    const packagesDir = writeBuiltIn();
    await loadBuiltInPacks(registry, packagesDir, { runtimeEntry: 'only' });
    const { hostPacksDir } = resolveAppContext();
    publishHostPackOutput(path.join(packagesDir, BUILT_IN_ID), path.join(hostPacksDir, BUILT_IN_ID));

    // The rebuild changes the pack's version and its published types
    writeBuiltIn({ version: '2.0.0' });
    fs.writeFileSync(path.join(packagesDir, BUILT_IN_ID, 'dist', 'snapshot.json'), '{"types":{"Widget":"Widget"}}');

    await reloadBuiltInPack(registry, BUILT_IN_ID, bus as never);

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
    await expect(reloadExternalPack(registry, PACK_ID, bus as never)).rejects.toThrow(`Failed to load pack ${PACK_ID}`);
    expectRunningPackIntact();
  });

  it('leaves the running pack intact when the rebuilt runtime exports no registration', async () => {
    writeRebuild(`module.exports = {};`);
    await expect(reloadExternalPack(registry, PACK_ID, bus as never)).rejects.toThrow(`Failed to load pack ${PACK_ID}`);
    expectRunningPackIntact();
  });

  it('restores the running registration when the rebuilt one is refused', async () => {
    registerPack({ id: 'service-owner', systems: [], services: { taken: {} } });
    writeRebuild(runtime(`services: { taken: {} },`));
    await expect(reloadExternalPack(registry, PACK_ID, bus as never)).rejects.toThrow(`Failed to register pack ${PACK_ID}`);
    expectRunningPackIntact();
  });

  it('shuts the running pack down and restarts its systems once the rebuild is registered', async () => {
    writeRebuild(runtime());
    await reloadExternalPack(registry, PACK_ID, bus as never);

    expect(getPackRegistration(PACK_ID)?.systems).not.toBe(running.systems);
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(bus.send).toHaveBeenCalledWith({ type: 'RELOAD_PACK', packId: PACK_ID, systemIds: [`${PACK_ID}.widget`] });
  });

  it("runs the rebuilt pack's new migrations against the version it recorded", async () => {
    resetTestData();
    appState.update({ packVersions: { [PACK_ID]: '1.0.0' } });
    const ran: string[] = [];
    Object.assign(globalThis, { reloadPackRuns: ran });
    writeRebuild(runtime(`migrations: ['1.0.0', '1.0.1'].map((target) => ({ target, description: target, up: () => globalThis.reloadPackRuns.push(target) })),`));

    await reloadExternalPack(registry, PACK_ID, bus as never);

    expect(ran).toEqual(['1.0.1']);
    expect(appState.get().packVersions).toEqual({ [PACK_ID]: '1.0.1' });
  });

  // Other packs' systems read what the pack registers and seeds (the chat's slash commands, say). A system
  // reading it between unregistering the running pack and registering the rebuild would find nothing
  it('tells the running systems the pack changed once the rebuild is registered and its systems restarted', async () => {
    writeRebuild(runtime());
    const registrationWhenSent: unknown[] = [];
    bus.send.mockImplementation((event: { type: string }) => {
      if (event.type === 'PACK_CHANGED') registrationWhenSent.push(getPackRegistration(PACK_ID)?.systems);
    });
    await reloadExternalPack(registry, PACK_ID, bus as never);

    expect(bus.send.mock.calls.map(([event]) => event.type)).toEqual(['RELOAD_PACK', 'PACK_CHANGED']);
    expect(bus.send).toHaveBeenCalledWith({ type: 'PACK_CHANGED', packId: PACK_ID });
    expect(registrationWhenSent).toHaveLength(1);
    expect(registrationWhenSent[0]).toBeDefined();
    expect(registrationWhenSent[0]).not.toBe(running.systems);
  });
});
