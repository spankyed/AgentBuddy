import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registry } from './test-host.ts';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadBuiltInPacks, loadExternalPacks, type LoadedPack } from '../../../src/packs/runtime/loader.ts';
import type { PackRegistration } from '@abuddy/sdk/framework';
import { seedPackData, computePackSeedHash, type PackSeedTarget } from '../../../src/packs/runtime/seed.ts';
import { appState } from '../../../src/app-state/index.ts';
import { getLoadedPackEntries } from '../../../src/packs/pack-layout.ts';
import { resetTestData, testRootEvents as rootEvents } from '@abuddy/sdk/testing';
import { seedFile } from '@abuddy/sdk/build';


/** A loaded pack's system by feature id: the loader now completes each system's bus id (`<packId>.<featureId>`) */
const systemOf = (pack: LoadedPack, featureId: string) =>
  pack.registration.systems.find((s) => s.id === `${pack.origin.id}.${featureId}`)!;


let tmpDir: string;
let origEnv: { env?: string; userDataDir?: string };

/** An installed pack: its manifest, integrity.json and a runtime/index.cjs registering `systemsSource` */
function makePack(
  packsDir: string,
  id: string,
  manifest: Record<string, unknown>,
  systemsSource = '[]',
) {
  const packDir = path.join(packsDir, id);
  fs.mkdirSync(path.join(packDir, 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(packDir, 'integrity.json'), JSON.stringify({ formatVersion: 1, id, version: '1.0.0', files: {} }));
  fs.writeFileSync(path.join(packDir, 'runtime', 'index.cjs'), `module.exports = { registration: { id: ${JSON.stringify(manifest.id)}, systems: ${systemsSource} } };`);
  return packDir;
}

beforeEach(() => {
  // Seed hashes live in AppState
  resetTestData();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-loader-test-'));
  origEnv = { env: process.env.ABUDDY_ENV, userDataDir: process.env.ABUDDY_USER_DATA_DIR };
  process.env.ABUDDY_ENV = 'test';
  process.env.ABUDDY_USER_DATA_DIR = tmpDir;
});

afterEach(() => {
  for (const [key, value] of [['ABUDDY_ENV', origEnv.env], ['ABUDDY_USER_DATA_DIR', origEnv.userDataDir]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('pack-loader', () => {
  describe('loadExternalPacks', () => {
    it('returns empty array when packs dir does not exist', () => {
      process.env.ABUDDY_USER_DATA_DIR = path.join(tmpDir, 'nonexistent');
      const result = loadExternalPacks();
      expect(result).toEqual([]);
    });

    it('returns empty array when packs dir is empty', () => {
      fs.mkdirSync(path.join(tmpDir, 'packs'), { recursive: true });
      const result = loadExternalPacks();
      expect(result).toEqual([]);
    });

    it('discovers and loads a valid pack, with the system events its manifest adds', () => {
      const packsDir = path.join(tmpDir, 'packs');
      makePack(packsDir, 'test-pack', {
        id: 'test-pack',
        name: 'Test Pack',
        version: '1.0.0',
        features: [{
          id: 'myFeature',
          system: { entry: 'src/features/myFeature/be/system.ts', events: { incoming: ['DO_THING'] } },
        }],
      }, "[{ id: 'test-pack.myFeature', machine: { id: 'test-system' }, events: [] }]");

      const result = loadExternalPacks();

      expect(result).toHaveLength(1);
      expect(result[0].origin.id).toBe('test-pack');
      expect(result[0].registration.systems.map((sys) => sys.id)).toEqual(['test-pack.myFeature']);
      expect(systemOf(result[0], 'myFeature').events.has('DO_THING')).toBe(true);
    });

    it("skips a pack directory that isn't an installed pack, naming how to install it", () => {
      const packDir = makePack(path.join(tmpDir, 'packs'), 'unbundled', { id: 'unbundled', name: 'Unbundled', version: '1.0.0' });
      fs.rmSync(path.join(packDir, 'integrity.json'));
      const warnings: string[] = [];
      const unsubscribe = rootEvents.onLog(event => {
        if (event.level === 'warn' && event.source === 'pack-loader') warnings.push(event.message);
      });
      try {
        expect(loadExternalPacks()).toEqual([]);
        expect(warnings).toEqual([expect.stringMatching(/^Skipping unbundled: .* isn't an installed pack \(no integrity\.json or runtime\/index\.cjs\)\. Install it with abuddy install or abuddy dev$/)]);
      } finally {
        unsubscribe();
      }
    });

    it('skips a pack without runtime/index.cjs', () => {
      const packDir = makePack(path.join(tmpDir, 'packs'), 'no-runtime', { id: 'no-runtime', name: 'No Runtime', version: '1.0.0' });
      fs.rmSync(path.join(packDir, 'runtime', 'index.cjs'));
      expect(loadExternalPacks()).toEqual([]);
    });

    it('skips packs without abuddy.json', () => {
      fs.mkdirSync(path.join(tmpDir, 'packs', 'no-manifest'), { recursive: true });
      const result = loadExternalPacks();
      expect(result).toEqual([]);
    });

    it('skips packs with invalid manifest (missing id)', () => {
      makePack(path.join(tmpDir, 'packs'), 'bad-pack', {
        name: 'Bad',
        version: '1.0.0',
      });
      const result = loadExternalPacks();
      expect(result).toEqual([]);
    });

    it('skips packs that require a newer host version', () => {
      makePack(path.join(tmpDir, 'packs'), 'future-pack', {
        id: 'future-pack',
        name: 'Future',
        version: '1.0.0',
        hostVersion: '>=99.0.0',
      });
      const result = loadExternalPacks();
      expect(result).toEqual([]);
    });

    it('skips packs whose hostVersion range excludes this host, not only >= ranges', () => {
      makePack(path.join(tmpDir, 'packs'), 'old-range-pack', {
        id: 'old-range-pack',
        name: 'Old Range',
        version: '1.0.0',
        hostVersion: '>=0.0.1 <0.0.2',
      });
      expect(loadExternalPacks()).toEqual([]);
    });

    it('loads packs whose hostVersion is satisfied', () => {
      makePack(path.join(tmpDir, 'packs'), 'compat-pack', {
        id: 'compat-pack',
        name: 'Compatible',
        version: '1.0.0',
        hostVersion: '>=0.1.0',
      });
      const result = loadExternalPacks();
      expect(result).toHaveLength(1);
    });

    it("loads a runtime requiring subpaths of the packages the host provides (the AI SDK's zod/v4)", () => {
      const packDir = makePack(path.join(tmpDir, 'packs'), 'zod-pack', { id: 'zod-pack', name: 'Zod', version: '1.0.0' });
      // An installed pack has no node_modules: the host's copy is the only one there is, subpaths included, and
      // no list of them exists — the bridge resolves whatever the pack asks for
      fs.writeFileSync(path.join(packDir, 'runtime', 'index.cjs'), [
        "const zod = require('zod');",
        "const { z } = require('zod/v4');",
        "const { createMachine } = require('xstate');",
        "const { and } = require('xstate/guards');",
        "module.exports = { registration: { id: 'zod-pack', systems: [] }, parsed: z.string().parse('ok'),",
        "  sameZod: require('zod/v4') === require('zod/v4'), hostZod: zod === require('zod'),",
        "  machine: typeof createMachine, guard: typeof and };",
      ].join('\n'));
      const [pack] = loadExternalPacks();
      expect(pack?.origin.id).toBe('zod-pack');

      // The modules the runtime got are the host's own, not a second copy
      const runtime = require(path.join(packDir, 'runtime', 'index.cjs')) as Record<string, unknown>;
      expect(runtime).toMatchObject({ parsed: 'ok', sameZod: true, hostZod: true, machine: 'function', guard: 'function' });
      expect(runtime.zodIsHost ?? require('zod/v4')).toBe(require('zod/v4'));
    });

    it('handles packs with no features array', () => {
      makePack(path.join(tmpDir, 'packs'), 'data-pack', {
        id: 'data-pack',
        name: 'Data Only',
        version: '1.0.0',
      });
      const result = loadExternalPacks();
      expect(result).toHaveLength(1);
      expect(result[0].registration.systems).toEqual([]);
    });

    it('handles features without system entry', () => {
      makePack(path.join(tmpDir, 'packs'), 'fe-only', {
        id: 'fe-only',
        name: 'Frontend Only',
        version: '1.0.0',
        features: [{
          id: 'widget',
          plugin: { entry: 'src/features/widget/fe/plugin.ts' },
        }],
      });
      const result = loadExternalPacks();
      expect(result).toHaveLength(1);
      expect(result[0].registration.systems).toEqual([]);
    });

  });

});

describe('loadBuiltInPacks: the bundled loaders', () => {
  /** A built-in pack dir, with a built runtime when `built` */
  function writeBuiltIn(id: string, built: boolean): string {
    const packagesDir = path.join(tmpDir, 'packages');
    const packDir = path.join(packagesDir, id);
    fs.mkdirSync(path.join(packDir, 'dist', 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({ id, name: id, version: '1.0.0', builtIn: true }));
    if (built) fs.writeFileSync(path.join(packDir, 'dist', 'runtime', 'index.cjs'), `module.exports = { registration: { id: '${id}', systems: [] } };`);
    return packagesDir;
  }

  afterEach(async () => {
    for (const id of ['bundled-only', 'built-pack']) if (registry.getPackExtensions(id)) registry.unregisterPack(id);
  });

  it("throws without them when runtimeEntry is 'never', naming the option", async () => {
    await expect(loadBuiltInPacks(registry, path.join(tmpDir, 'none'), { runtimeEntry: 'never' })).rejects.toThrow(/needs the bundledLoaders option/);
  });

  it("throws without them when 'prefer' falls back to them, naming the option", async () => {
    await expect(loadBuiltInPacks(registry, writeBuiltIn('bundled-only', false), { runtimeEntry: 'prefer' })).rejects.toThrow(/needs the bundledLoaders option/);
  });

  it("loads built runtimes without them ('prefer' that doesn't fall back, and 'only')", async () => {
    const packagesDir = writeBuiltIn('built-pack', true);
    expect((await loadBuiltInPacks(registry, packagesDir, { runtimeEntry: 'prefer' })).map(p => p.id)).toEqual(['built-pack']);
  });

  it('loads a pack through its bundled loader', async () => {
    const packagesDir = writeBuiltIn('bundled-only', false);
    const loaded = await loadBuiltInPacks(registry, packagesDir, {
      runtimeEntry: 'never',
      bundledLoaders: async () => ({ 'bundled-only': async () => ({ registration: { id: 'bundled-only', systems: [] } }) }),
    });
    expect(loaded.map(p => p.id)).toEqual(['bundled-only']);
  });
});

describe('pack-loader: bundled runtime (runtime/index.cjs)', () => {
  function makeBundledPack(id: string, registrationSource: string, manifestExtra: Record<string, unknown> = {}) {
    const packDir = path.join(tmpDir, 'packs', id);
    fs.mkdirSync(path.join(packDir, 'runtime', 'seeds'), { recursive: true });
    fs.mkdirSync(path.join(packDir, 'types'), { recursive: true });
    fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({ id, name: id, version: '1.0.0', ...manifestExtra }));
    fs.writeFileSync(path.join(packDir, 'integrity.json'), JSON.stringify({ formatVersion: 1, id, version: '1.0.0', files: {} }));
    fs.writeFileSync(path.join(packDir, 'types', 'snapshot.json'), '{}');
    fs.writeFileSync(path.join(packDir, 'runtime', 'index.cjs'), registrationSource);
    return packDir;
  }

  const registration = (id: string, extra = '') => `
    let compiledDir = null;
    const machine = { id: 'widget', events: ['PING'], config: {} };
    module.exports = {
      setCompiledDir(dir) { compiledDir = dir; module.exports.compiledDirSeen = dir; },
      registration: {
        id: '${id}',
        systems: [{ id: '${id}.widget', machine, events: new Set(['PING']) }],
        services: { hello: () => 'hi' },
        ears: {
          entities: { Widget: 'Widget' },
          relKinds: {},
          partitionPolicy: { excludedEntityTypes: [] },
        },
        boot: {
          onInit() {},
          seedManifest: { seedKeys: ['actions'], get compiledDir() { return compiledDir; } },
        },
        ${extra}
      },
    };
  `;

  it('loads systems, services and EARS from the runtime registration', () => {
    const dir = makeBundledPack('bundled-pack', registration('bundled-pack'), {
      features: [{ id: 'widget', system: { entry: 'src/x.ts', events: { incoming: ['EXTRA'] } } }],
    });

    const [pack] = loadExternalPacks();
    expect(pack.origin.id).toBe('bundled-pack');
    expect(pack.registration.systems.map((sys) => sys.id)).toEqual(['bundled-pack.widget']);
    expect([...systemOf(pack, 'widget').events].sort()).toEqual(['EXTRA', 'PING']);
    expect(Object.keys(pack.registration.services ?? {})).toEqual(['hello']);
    expect(pack.registration.ears?.entities).toEqual({ Widget: 'Widget' });
    expect(pack.registration.boot?.onInit).toBeTypeOf('function');

    // seeds live under runtime/seeds for bundled packs
    const mod = require(path.join(dir, 'runtime', 'index.cjs'));
    expect(mod.compiledDirSeen).toBe(path.join(dir, 'runtime', 'seeds'));
  });

  it("registers the runtime's seed hooks and feature settings with the pack", async () => {
    const { registerExternalPacks } = await import('../../../src/packs/runtime/loader.ts');
    const { getPackSettingsDefaults } = await import('@abuddy/sdk/framework');
    const { _seedHookRegistry } = await import('@abuddy/sdk/seed');
    makeBundledPack('settings-pack', registration('settings-pack', `
      seedHooks: { Widget: { find() { return undefined; } } },
      features: [{ id: 'widget', hasSystem: true, services: [], settings: { plugins: { _meta: { visibility: { widget: false } }, widget: { size: 3 } } } }],
    `));

    const [pack] = loadExternalPacks();
    expect(registerExternalPacks(registry, [pack])).toEqual([pack]);
    try {
      expect(_seedHookRegistry.get('Widget')).toEqual({ find: expect.any(Function) });
      expect(getPackSettingsDefaults().settings).toEqual({ plugins: { 'settings-pack.widget': { size: 3 }, _meta: { visibility: { 'settings-pack.widget': false } } } });
    } finally {
      registry.unregisterPack('settings-pack');
    }
  });

  it('strips the declarative boot seed and an empty partition policy', () => {
    makeBundledPack('strip-pack', registration('strip-pack'));
    const [pack] = loadExternalPacks();
    expect(pack.registration.boot?.seedManifest).toBeUndefined();
    expect(pack.registration.ears?.partitionPolicy).toBeUndefined();
  });

  // It strips them off copies. What the app refuses an external pack is the app's decision about this load,
  // and `boot` and `ears` are the pack module's own objects: taking the keys off those would leave the pack
  // exporting whatever the last load made of it, which a reload reusing the module would then read.
  it('leaves the registration the pack module exports as the pack wrote it', () => {
    const dir = makeBundledPack('intact-pack', registration('intact-pack'));

    loadExternalPacks();

    const exported = (require(path.join(dir, 'runtime', 'index.cjs')) as { registration: PackRegistration }).registration;
    expect(exported.boot?.seedManifest, "the app's strip reached the pack's own object").toBeDefined();
    expect(exported.ears?.partitionPolicy).toBeDefined();
  });

  it("never calls a seed function an external pack's boot hooks export; seedPackData seeds it once", async () => {
    const { registerExternalPacks } = await import('../../../src/packs/runtime/loader.ts');
    const dir = makeBundledPack('smuggle-pack', registration('smuggle-pack').replace(
      'onInit() {},',
      'onInit() {}, seed() { module.exports.bootSeedCalls = (module.exports.bootSeedCalls ?? 0) + 1; },',
    ));
    fs.writeFileSync(path.join(dir, 'runtime', 'seeds', 'actions.seed.json'), '[]');

    const packs = loadExternalPacks();
    expect(registerExternalPacks(registry, packs)).toEqual(packs);
    try {
      const orchestrate = vi.fn();
      registry.runRegisteredBootSeeds(orchestrate);
      const mod = require(path.join(dir, 'runtime', 'index.cjs'));
      expect(mod.bootSeedCalls).toBeUndefined();
      expect(orchestrate).not.toHaveBeenCalled();

      const seedFn = vi.fn(() => ({}));
      seedPackData(packs.map((p) => ({ manifest: p.origin, dir: p.origin.dir })), seedFn);
      expect(seedFn).toHaveBeenCalledTimes(1);
      expect(seedFn).toHaveBeenCalledWith(expect.objectContaining({ compiledDir: path.join(dir, 'runtime', 'seeds') }));
    } finally {
      registry.unregisterPack('smuggle-pack');
    }
  });

  it('refuses a runtime built against an @abuddy/sdk module this app no longer provides, saying to rebuild it', async () => {
    const { onLog } = await import('@abuddy/sdk/logger');
    const errors: string[] = [];
    const stop = onLog((entry) => { if (entry.level === 'error') errors.push(entry.message); });
    try {
      makeBundledPack('stale-pack', `require('@abuddy/sdk/rpc');\n${registration('stale-pack')}`);
      makeBundledPack('current-pack', registration('current-pack'));

      expect(loadExternalPacks().map(p => p.origin.id)).toEqual(['current-pack']);
      expect(errors).toEqual([expect.stringContaining("@abuddy/sdk/rpc isn't provided by this AgentBuddy: rebuild the pack with the current @abuddy/cli")]);
    } finally {
      stop();
    }
  });

  it('refuses a runtime whose registration id does not match the manifest', () => {
    makeBundledPack('real-id', registration('other-id'));
    expect(loadExternalPacks()).toEqual([]);
  });

  it('refuses a layout version this host does not support', () => {
    const dir = makeBundledPack('future-format', registration('future-format'));
    fs.writeFileSync(path.join(dir, 'integrity.json'), JSON.stringify({ formatVersion: 2, id: 'future-format', version: '1.0.0', files: {} }));
    expect(loadExternalPacks()).toEqual([]);
  });

  it('seeds from runtime/seeds', () => {
    const dir = makeBundledPack('seed-bundle', registration('seed-bundle'));
    fs.writeFileSync(path.join(dir, 'runtime', 'seeds', 'actions.seed.json'), '[]');
    const packs = loadExternalPacks();
    const seedFn = vi.fn(() => ({}));
    seedPackData(packs.map((p) => ({ manifest: p.origin, dir: p.origin.dir })), seedFn);
    expect(seedFn).toHaveBeenCalledWith(expect.objectContaining({ compiledDir: path.join(dir, 'runtime', 'seeds') }));
  });
});

describe('seedPackData: failures', () => {
  function installedPack(id: string) {
    const dir = path.join(tmpDir, 'packs', id);
    fs.mkdirSync(path.join(dir, 'runtime', 'seeds'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'runtime', 'index.cjs'), '');
    fs.writeFileSync(path.join(dir, 'runtime', 'seeds', 'flows.seed.json'), '{}');
    return { manifest: { id }, dir } satisfies PackSeedTarget;
  }
  function registryEntry(id: string) {
    const registry = JSON.parse(fs.readFileSync(path.join(tmpDir, 'installed-packs.json'), 'utf-8'));
    return registry.packs.find((p: any) => p.id === id);
  }
  function writeRegistry(ids: string[]) {
    fs.writeFileSync(path.join(tmpDir, 'installed-packs.json'), JSON.stringify({
      packs: ids.map(id => ({ id, name: id, version: '1.0.0', dir: '', enabled: true, installedAt: '' })),
    }));
  }

  const failingSeed = () => ({ flows: { created: 0, updated: 0, skipped: 0, errors: ['Flow "X" is invalid: missing event'] } });

  it('treats seed errors as a failure and records lastError', () => {
    const pack = installedPack('bad-flows');
    writeRegistry(['bad-flows']);

    const failures = seedPackData([pack], failingSeed);

    expect(failures).toEqual([{ packId: 'bad-flows', errors: ['flows: Flow "X" is invalid: missing event'] }]);
    expect(registryEntry('bad-flows').lastError).toBe('flows: Flow "X" is invalid: missing event');
  });

  it("doesn't re-import unchanged failing seed data on every boot, and keeps its lastError", () => {
    const pack = installedPack('bad-flows');
    writeRegistry(['bad-flows']);
    const seedFn = vi.fn(failingSeed);

    seedPackData([pack], seedFn);
    seedPackData([pack], seedFn);

    expect(seedFn).toHaveBeenCalledTimes(1);
    expect(registryEntry('bad-flows').lastError).toBe('flows: Flow "X" is invalid: missing event');
  });

  it('re-seeds data that matches an earlier successful seed after a failed one (rollback)', () => {
    const pack = installedPack('rollback');
    writeRegistry(['rollback']);
    const seedsDir = path.join(pack.dir, 'runtime', 'seeds');
    const seedFn = vi.fn(() => ({}));

    seedPackData([pack], seedFn); // v1 seeds
    fs.writeFileSync(path.join(seedsDir, 'flows.seed.json'), '{"v2": {}}');
    seedPackData([pack], failingSeed); // v2 fails
    fs.writeFileSync(path.join(seedsDir, 'flows.seed.json'), '{}');
    seedPackData([pack], seedFn); // back to v1's data

    expect(seedFn).toHaveBeenCalledTimes(2);
    expect(registryEntry('rollback')).not.toHaveProperty('lastError');
  });

  // What makes the retry possible without re-importing on every boot: the hash says the pack's own data is
  // unchanged, and this says what its dependencies were when it failed. A pack that seeded cleanly has
  // nothing to compare against, so it keeps no entry.
  it('records what a failed seed faced, and keeps nothing once the pack seeds cleanly', () => {
    const pack = { ...installedPack('records'), manifest: { id: 'records', dependencies: { provider: '^1.0.0' } } };
    writeRegistry(['records']);

    seedPackData([pack], failingSeed);
    expect(appState.get().packSeedDeps).toEqual({ records: 'provider:' });

    fs.writeFileSync(path.join(pack.dir, 'runtime', 'seeds', 'flows.seed.json'), '{"fixed": {}}');
    seedPackData([pack], () => ({}));

    expect(appState.get().packSeedDeps).toEqual({});
  });

  // The failure this is all for: pack B's seeds reference what pack A seeds, B seeded first and failed, and
  // B's own data never changes again — so before this it stayed broken until it was reinstalled.
  it('seeds a pack again once a pack it depends on has seeded since it failed', () => {
    const dependency = installedPack('provider');
    const dependent = { ...installedPack('consumer'), manifest: { id: 'consumer', dependencies: { provider: '^1.0.0' } } };
    writeRegistry(['provider', 'consumer']);
    const seedFn = vi.fn(() => ({}));

    // The dependency isn't installed yet, so the dependent seeds against nothing and fails
    seedPackData([dependent], failingSeed);
    expect(registryEntry('consumer').lastError).toBeTruthy();

    // Its own data is unchanged, so on its own it is still skipped
    seedPackData([dependent], seedFn);
    expect(seedFn).not.toHaveBeenCalled();

    // ...until the pack it depends on seeds, which is the thing that could change the outcome
    seedPackData([dependency, dependent], seedFn);

    expect(seedFn).toHaveBeenCalledTimes(2);
    expect(registryEntry('consumer')).not.toHaveProperty('lastError');
  });

  it('stops retrying a pack that failed once its dependencies settle again', () => {
    const dependency = installedPack('steady');
    const dependent = { ...installedPack('flaky'), manifest: { id: 'flaky', dependencies: { steady: '^1.0.0' } } };
    writeRegistry(['steady', 'flaky']);
    const seedFn = vi.fn(failingSeed);

    seedPackData([dependency, dependent], seedFn);
    const attempts = seedFn.mock.calls.length;

    // Nothing has changed since: not the pack's data, and not what it failed against
    seedPackData([dependency, dependent], seedFn);

    expect(seedFn).toHaveBeenCalledTimes(attempts);
    expect(registryEntry('flaky').lastError).toBeTruthy();
  });

  it('forgets what a failed seed faced once the pack has no seed data to retry', () => {
    const pack = { ...installedPack('withdrawn'), manifest: { id: 'withdrawn', dependencies: { provider: '^1.0.0' } } };
    writeRegistry(['withdrawn']);
    seedPackData([pack], failingSeed);
    expect(appState.get().packSeedDeps).toHaveProperty('withdrawn');

    fs.rmSync(path.join(pack.dir, 'runtime', 'seeds'), { recursive: true });
    seedPackData([pack], vi.fn());

    expect(appState.get().packSeedDeps).toEqual({});
  });

  it("clears an earlier version's lastError when the pack no longer has seed data", () => {
    const pack = installedPack('no-more-seeds');
    fs.rmSync(path.join(pack.dir, 'runtime', 'seeds'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'installed-packs.json'), JSON.stringify({
      packs: [{ id: 'no-more-seeds', name: 'n', version: '1.0.1', dir: '', enabled: true, installedAt: '', lastError: 'v1.0.0 failure' }],
    }));

    seedPackData([pack], vi.fn());

    expect(registryEntry('no-more-seeds')).not.toHaveProperty('lastError');
  });

  // No seed key is the host's: a pack's `settings` seed is its own data, like any other key
  it('runs every seeder the pack registered, a settings seeder included', async () => {
    const { seedData } = await import('@abuddy/sdk/utils');
    const { testPacks } = await import('@abuddy/sdk/testing');
    const pack = installedPack('with-settings');
    writeRegistry(['with-settings']);
    fs.writeFileSync(path.join(pack.dir, 'runtime', 'seeds', 'settings.seed.json'), '{"plugins": {}}');
    const settingsSeed = vi.fn(() => ({ created: 0, updated: 1, skipped: 0 }));
    const actionsSeed = vi.fn(() => ({ created: 1, updated: 0, skipped: 0 }));
    fs.writeFileSync(path.join(pack.dir, 'runtime', 'seeds', 'seeds.json'), JSON.stringify({ version: 1, packId: 'with-settings', seeds: [] }));
    // The seeders its registration carries
    testPacks.seeders.set('with-settings', [{ key: 'settings', seed: settingsSeed }, { key: 'actions', seed: actionsSeed }]);

    try {
      seedPackData([pack], seedData);
    } finally {
      testPacks.seeders.delete('with-settings');
    }

    expect(actionsSeed).toHaveBeenCalledOnce();
    expect(settingsSeed).toHaveBeenCalledOnce();
  });

  it('records a thrown seeder as a failure too', () => {
    const pack = installedPack('throws');
    writeRegistry(['throws']);
    const failures = seedPackData([pack], () => { throw new Error('boom'); });
    expect(failures).toEqual([{ packId: 'throws', errors: ['boom'] }]);
    expect(registryEntry('throws').lastError).toBe('boom');
  });

  it('clears lastError after a successful seed', () => {
    const pack = installedPack('recovered');
    fs.writeFileSync(path.join(tmpDir, 'installed-packs.json'), JSON.stringify({
      packs: [{ id: 'recovered', name: 'r', version: '1.0.0', dir: '', enabled: true, installedAt: '', lastError: 'old failure' }],
    }));
    const failures = seedPackData([pack], () => ({ flows: { created: 1, updated: 0, skipped: 0 } }));
    expect(failures).toEqual([]);
    expect(registryEntry('recovered')).not.toHaveProperty('lastError');
  });
});

describe('seedPackData', () => {
  function makePackWithSeeds(
    packsDir: string,
    id: string,
    artifacts?: Record<string, any>,
  ) {
    const packDir = path.join(packsDir, id);
    const distDir = path.join(packDir, 'runtime', 'seeds');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({
      id, name: id, version: '1.0.0',
    }));
    if (artifacts) {
      for (const [name, data] of Object.entries(artifacts)) {
        fs.writeFileSync(path.join(distDir, name), JSON.stringify(data));
      }
    }
    return {
      manifest: { id, name: id, version: '1.0.0' },
      dir: packDir,
      systems: new Map(),
    } as any;
  }

  it('calls seedFn for packs with compiled seeds in runtime/seeds', () => {
    const packsDir = path.join(tmpDir, 'packs');
    const pack = makePackWithSeeds(packsDir, 'data-pack', {
      [seedFile('actions')]: [{ label: 'test-action', actionFn: 'return true' }],
    });

    const seedFn = vi.fn().mockReturnValue({});

    seedPackData([pack], seedFn);

    expect(seedFn).toHaveBeenCalledOnce();
    expect(seedFn).toHaveBeenCalledWith({
      compiledDir: path.join(pack.dir, 'runtime', 'seeds'),
      mode: 'replace-on-collision',
    });
  });

  it('skips packs without runtime/seeds', () => {
    const packDir = path.join(tmpDir, 'packs', 'no-dist');
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({
      id: 'no-dist', name: 'No Dist', version: '1.0.0',
    }));

    const pack = {
      manifest: { id: 'no-dist', name: 'No Dist', version: '1.0.0' },
      dir: packDir,
      systems: new Map(),
    } as any;

    const seedFn = vi.fn().mockReturnValue({});
    seedPackData([pack], seedFn);

    expect(seedFn).not.toHaveBeenCalled();
  });

  it('skips packs whose seed hash has not changed', () => {
    const packsDir = path.join(tmpDir, 'packs');
    const pack = makePackWithSeeds(packsDir, 'cached-pack', {
      [seedFile('actions')]: [{ label: 'cached' }],
    });

    const distDir = path.join(pack.dir, 'runtime', 'seeds');
    const hash = computePackSeedHash(distDir);
    appState.update({ packSeedHashes: { 'cached-pack': hash } });

    const seedFn = vi.fn().mockReturnValue({});
    seedPackData([pack], seedFn);

    expect(seedFn).not.toHaveBeenCalled();
  });

  it('re-seeds when pack content changes', () => {
    const packsDir = path.join(tmpDir, 'packs');
    const pack = makePackWithSeeds(packsDir, 'updated-pack', {
      [seedFile('actions')]: [{ label: 'v1' }],
    });

    appState.update({ packSeedHashes: { 'updated-pack': 'old-hash', 'disabled-pack': 'its-hash' } });
    const seedFn = vi.fn().mockReturnValue({});

    seedPackData([pack], seedFn);

    expect(seedFn).toHaveBeenCalledOnce();
    const { packSeedHashes } = appState.get();
    expect(packSeedHashes['updated-pack']).toBe(computePackSeedHash(path.join(pack.dir, 'runtime', 'seeds')));
    // A pack not loaded this boot (disabled) keeps its hash, so enabling it doesn't import its seeds again
    expect(packSeedHashes['disabled-pack']).toBe('its-hash');
  });

  it('continues seeding other packs when one fails', () => {
    const packsDir = path.join(tmpDir, 'packs');
    const pack1 = makePackWithSeeds(packsDir, 'fail-pack', {
      [seedFile('actions')]: [{ label: 'will-fail' }],
    });
    const pack2 = makePackWithSeeds(packsDir, 'ok-pack', {
      [seedFile('actions')]: [{ label: 'will-succeed' }],
    });

    let callCount = 0;
    const seedFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error('seed failed');
      return {};
    });

    seedPackData([pack1, pack2], seedFn);

    expect(seedFn).toHaveBeenCalledTimes(2);
    // A failed seed's hash is stored too, so the same failing data isn't retried every boot
    expect(appState.get().packSeedHashes).toEqual({ 'fail-pack': expect.any(String), 'ok-pack': expect.any(String) });
  });
});

describe('computePackSeedHash', () => {
  it('returns empty string for a directory with no seed files', () => {
    const emptyDir = path.join(tmpDir, 'empty-dist');
    fs.mkdirSync(emptyDir, { recursive: true });
    expect(computePackSeedHash(emptyDir)).toBe('');
  });

  it('returns the same hash for files nothing has touched', () => {
    const distDir = path.join(tmpDir, 'hash-test');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, seedFile('actions')), '[]');

    const hash1 = computePackSeedHash(distDir);
    const hash2 = computePackSeedHash(distDir);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
  });

  // An install replaces the pack's files rather than editing them, and reinstalling the version already
  // installed leaves the bytes identical. Only the files tell the two apart, and only an install makes new
  // ones — which is how `abuddy install` gets a re-seed without reaching into the app's database.
  it('returns a different hash when the same bytes are put back in new files', () => {
    const distDir = path.join(tmpDir, 'hash-replaced');
    fs.mkdirSync(distDir, { recursive: true });
    const file = path.join(distDir, seedFile('actions'));
    fs.writeFileSync(file, '[{"label":"same"}]');
    const before = computePackSeedHash(distDir);

    // What placePack leaves behind: the same content, in a file that wasn't there a moment ago
    fs.writeFileSync(file, '[{"label":"same"}]');
    const replaced = new Date(Date.now() + 5_000);
    fs.utimesSync(file, replaced, replaced);

    expect(computePackSeedHash(distDir)).not.toBe(before);
  });

  // The claim the rest of this rests on: an install really does leave new files, so `abuddy install` gets a
  // re-seed without the CLI reaching into the app's database the way the in-app install once did
  it('changes after installing the same pack source over itself', async () => {
    const { installPackFromLocal } = await import('../../../src/packs/pack-installer.ts');
    const source = path.join(tmpDir, 'reinstall-source');
    fs.mkdirSync(path.join(source, 'dist', 'runtime', 'seeds'), { recursive: true });
    fs.writeFileSync(path.join(source, 'abuddy.json'), JSON.stringify({ id: 'reinstalled', name: 'R', version: '1.0.0' }));
    fs.writeFileSync(path.join(source, 'dist', 'runtime', 'index.cjs'), 'module.exports = {};');
    fs.mkdirSync(path.join(source, 'dist', 'types'), { recursive: true });
    fs.writeFileSync(path.join(source, 'dist', 'types', 'snapshot.json'), '{}');
    fs.writeFileSync(path.join(source, 'dist', 'runtime', 'seeds', seedFile('actions')), '[{"label":"same"}]');

    const packsDir = path.join(tmpDir, 'packs');
    const { dir } = await installPackFromLocal(source, packsDir);
    const seeds = path.join(dir, 'runtime', 'seeds');
    const before = computePackSeedHash(seeds);

    await installPackFromLocal(source, packsDir);

    expect(computePackSeedHash(seeds), 'a reinstall left the seeds looking untouched').not.toBe(before);
  });

  it('returns different hash when content changes', () => {
    const distDir = path.join(tmpDir, 'hash-change');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, seedFile('actions')), '[{"label":"v1"}]');
    const hash1 = computePackSeedHash(distDir);

    fs.writeFileSync(path.join(distDir, seedFile('actions')), '[{"label":"v2"}]');
    const hash2 = computePackSeedHash(distDir);

    expect(hash1).not.toBe(hash2);
  });

  it('hashes any JSON file, not just known artifact types', () => {
    const distDir = path.join(tmpDir, 'custom-artifacts');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, 'compiled-widgets.json'), '[{"id":"w1"}]');

    const hash = computePackSeedHash(distDir);
    expect(hash).toHaveLength(16);
  });

  it('ignores non-JSON files', () => {
    const distDir = path.join(tmpDir, 'mixed-files');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, 'system.cjs'), 'module.exports = {}');

    expect(computePackSeedHash(distDir)).toBe('');

    fs.writeFileSync(path.join(distDir, 'data.json'), '[]');
    expect(computePackSeedHash(distDir)).toHaveLength(16);
  });
});

describe('loaded packs: the packs.loaded entries', () => {
  it('lists the built-in packs, then the loaded packs with frontend files', () => {
    const withFrontend = path.join(tmpDir, 'with-fe');
    fs.mkdirSync(path.join(withFrontend, 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(withFrontend, 'runtime', 'fe.js'), '');
    fs.writeFileSync(path.join(withFrontend, 'runtime', 'fe.css'), '');
    const backendOnly = path.join(tmpDir, 'be-only');
    fs.mkdirSync(backendOnly);
    const external = (id: string, dir: string) => ({ id, name: id, version: '2.0.0', dir, builtIn: false });
    const loaded = {
      builtInPacks: () => [{ id: 'built-in', name: 'Built-in', version: '1.0.0', dir: tmpDir, builtIn: true }],
      externalPacks: () => [external('with-fe', withFrontend), external('be-only', backendOnly)],
    };

    expect(getLoadedPackEntries(loaded)).toEqual([
      { id: 'built-in', name: 'Built-in', version: '1.0.0', builtIn: true },
      { id: 'with-fe', name: 'with-fe', version: '2.0.0', feEntry: 'runtime/fe.js', feStyles: 'runtime/fe.css' },
    ]);
  });
});
