import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registry } from './test-host.ts';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadAppPacks, loadExternalPacks, type LoadedPack } from '../../../src/packs/runtime/loader.ts';
import type { PackRegistration } from '@abuddy/sdk/framework';
import { applyPacks, contentRevision, type PackContentTarget } from '../../../src/packs/runtime/apply.ts';
import { appliedContent, appState } from '../../../src/app-state/index.ts';
import { getLoadedPackEntries } from '../../../src/packs/layout.ts';
import { resetTestData, testRootEvents as rootEvents } from '@abuddy/sdk/testing';
import { PACK_SNAPSHOT_FORMAT, contentFile } from '@abuddy/sdk/build';
import type { ApplyRecord } from '@abuddy/sdk/utils';
import { _appDirOf } from '@abuddy/sdk/env';
import { PACK_LAYOUT, PACK_LAYOUT_VERSION } from '../../../src/packs/layout.ts';


/** The features of a loaded pack that have a system */
const systemFeatures = (pack: LoadedPack) =>
  Object.entries(pack.registration.features ?? {}).filter(([, feature]) => feature.system).map(([featureId]) => featureId);


let tmpDir: string;
let origEnv: { env?: string; userDataDir?: string };

/** An installed pack: its manifest, integrity.json and a runtime/index.cjs registering `featuresSource` */
function makePack(
  packsDir: string,
  id: string,
  manifest: Record<string, unknown>,
  featuresSource = '{}',
) {
  const packDir = path.join(packsDir, id);
  fs.mkdirSync(path.join(packDir, 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(packDir, PACK_LAYOUT.integrity), JSON.stringify({ formatVersion: PACK_LAYOUT_VERSION, id, version: '1.0.0', files: {} }));
  fs.mkdirSync(path.join(packDir, 'types'), { recursive: true });
  fs.writeFileSync(path.join(packDir, PACK_LAYOUT.snapshot), JSON.stringify({ format: PACK_SNAPSHOT_FORMAT }));
  fs.writeFileSync(path.join(packDir, 'runtime', 'index.cjs'), `module.exports = { registration: { id: ${JSON.stringify(manifest.id)}, features: ${featuresSource} } };`);
  return packDir;
}

beforeEach(() => {
  // Content hashes live in AppState
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
      fs.mkdirSync(path.join(_appDirOf(tmpDir), 'packs'), { recursive: true });
      const result = loadExternalPacks();
      expect(result).toEqual([]);
    });

    it('discovers and loads a valid pack, with the system events its manifest adds', () => {
      const packsDir = path.join(_appDirOf(tmpDir), 'packs');
      makePack(packsDir, 'test-pack', {
        id: 'test-pack',
        name: 'Test Pack',
        version: '1.0.0',
        features: {
          myFeature: { system: { entry: 'src/features/myFeature/be/system.ts', events: { incoming: ['DO_THING'] } } },
        },
      }, "{ myFeature: { system: { machine: { id: 'test-system' }, receives: ['DO_THING'] } } }");

      const result = loadExternalPacks();

      expect(result).toHaveLength(1);
      expect(result[0].origin.id).toBe('test-pack');
      expect(systemFeatures(result[0])).toEqual(['myFeature']);
    });

    it("skips a pack directory that isn't an installed pack, naming how to install it", () => {
      const packDir = makePack(path.join(_appDirOf(tmpDir), 'packs'), 'unbundled', { id: 'unbundled', name: 'Unbundled', version: '1.0.0' });
      fs.rmSync(path.join(packDir, PACK_LAYOUT.integrity));
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
      const packDir = makePack(path.join(_appDirOf(tmpDir), 'packs'), 'no-runtime', { id: 'no-runtime', name: 'No Runtime', version: '1.0.0' });
      fs.rmSync(path.join(packDir, 'runtime', 'index.cjs'));
      expect(loadExternalPacks()).toEqual([]);
    });

    it('skips packs without abuddy.json', () => {
      fs.mkdirSync(path.join(_appDirOf(tmpDir), 'packs', 'no-manifest'), { recursive: true });
      const result = loadExternalPacks();
      expect(result).toEqual([]);
    });

    it('skips packs with invalid manifest (missing id)', () => {
      makePack(path.join(_appDirOf(tmpDir), 'packs'), 'bad-pack', {
        name: 'Bad',
        version: '1.0.0',
      });
      const result = loadExternalPacks();
      expect(result).toEqual([]);
    });

    it('skips packs that require a newer host version', () => {
      makePack(path.join(_appDirOf(tmpDir), 'packs'), 'future-pack', {
        id: 'future-pack',
        name: 'Future',
        version: '1.0.0',
        hostVersion: '>=99.0.0',
      });
      const result = loadExternalPacks();
      expect(result).toEqual([]);
    });

    it('skips packs whose hostVersion range excludes this host, not only >= ranges', () => {
      makePack(path.join(_appDirOf(tmpDir), 'packs'), 'old-range-pack', {
        id: 'old-range-pack',
        name: 'Old Range',
        version: '1.0.0',
        hostVersion: '>=0.0.1 <0.0.2',
      });
      expect(loadExternalPacks()).toEqual([]);
    });

    it('loads packs whose hostVersion is satisfied', () => {
      makePack(path.join(_appDirOf(tmpDir), 'packs'), 'compat-pack', {
        id: 'compat-pack',
        name: 'Compatible',
        version: '1.0.0',
        hostVersion: '>=0.1.0',
      });
      const result = loadExternalPacks();
      expect(result).toHaveLength(1);
    });

    it("loads a runtime requiring subpaths of the packages the host provides (the AI SDK's zod/v4)", () => {
      const packDir = makePack(path.join(_appDirOf(tmpDir), 'packs'), 'zod-pack', { id: 'zod-pack', name: 'Zod', version: '1.0.0' });
      // An installed pack has no node_modules: the host's copy is the only one there is, subpaths included, and
      // no list of them exists — the bridge resolves whatever the pack asks for
      fs.writeFileSync(path.join(packDir, 'runtime', 'index.cjs'), [
        "const zod = require('zod');",
        "const { z } = require('zod/v4');",
        "const { createMachine } = require('xstate');",
        "const { and } = require('xstate/guards');",
        "module.exports = { registration: { id: 'zod-pack' }, parsed: z.string().parse('ok'),",
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
      makePack(path.join(_appDirOf(tmpDir), 'packs'), 'data-pack', {
        id: 'data-pack',
        name: 'Data Only',
        version: '1.0.0',
      });
      const result = loadExternalPacks();
      expect(result).toHaveLength(1);
      expect(systemFeatures(result[0])).toEqual([]);
    });

  });

});

// A pack this app shipped registers before one the user installed, whatever order the packs directory is
// read in: registration order decides who wins a designation, so a pack claiming `brain` would otherwise
// take it from the pack the app needs to run. The order is an argument now (`shippedIds`), not a
// consequence of loading in two calls, so it is something to assert rather than something structural.
describe('loadAppPacks', () => {
  afterEach(() => {
    for (const id of ['role-shipped', 'role-taker']) if (registry.getPackExtensions(id)) registry.unregisterPack(id);
  });

  it('registers a pack this app shipped before one it did not', () => {
    const packs = path.join(_appDirOf(tmpDir), 'packs');
    // Named so the packs directory is read with the shipped one *last*, which is what makes this a check
    makePack(packs, 'role-taker', { id: 'role-taker', name: 'Taker', version: '1.0.0' }, "{ taker: { designation: 'loader-spec-role' } }");
    makePack(packs, 'role-shipped', { id: 'role-shipped', name: 'Shipped', version: '1.0.0' }, "{ owner: { designation: 'loader-spec-role' } }");

    const { loaded } = loadAppPacks(registry, new Set(['role-shipped']));

    expect(registry.designation('loader-spec-role')).toBe('role-shipped/owner');
    // The other pack's claim on the role is what fails, not the shipped pack's
    expect(loaded.map((pack) => pack.origin.id)).toEqual(['role-shipped']);
    expect(registry.packOrigin('role-shipped')?.shipped, 'the origin records which copy the app shipped').toBe(true);
  });

  it('records a pack the app did not ship as one it did not', () => {
    makePack(path.join(_appDirOf(tmpDir), 'packs'), 'role-taker', { id: 'role-taker', name: 'Taker', version: '1.0.0' }, '{}');

    loadAppPacks(registry);

    expect(registry.packOrigin('role-taker')?.shipped).toBe(false);
  });
});

describe('pack-loader: bundled runtime (runtime/index.cjs)', () => {
  function makeBundledPack(id: string, registrationSource: string, manifestExtra: Record<string, unknown> = {}) {
    const packDir = path.join(_appDirOf(tmpDir), 'packs', id);
    fs.mkdirSync(path.join(packDir, 'runtime', 'content'), { recursive: true });
    fs.mkdirSync(path.join(packDir, 'types'), { recursive: true });
    fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({ id, name: id, version: '1.0.0', ...manifestExtra }));
    fs.writeFileSync(path.join(packDir, PACK_LAYOUT.integrity), JSON.stringify({ formatVersion: PACK_LAYOUT_VERSION, id, version: '1.0.0', files: {} }));
    fs.writeFileSync(path.join(packDir, PACK_LAYOUT.snapshot), JSON.stringify({ format: PACK_SNAPSHOT_FORMAT }));
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
        ${extra.includes('features:') ? '' : "features: { widget: { system: { machine, receives: ['PING', 'EXTRA'] } } },"}
        services: { hello: () => 'hi' },
        ears: {
          entities: { Widget: 'Widget' },
          relKinds: {},
        },
        boot: {
          onInit() {},
        },
        ${extra}
      },
    };
  `;

  it('loads systems, services and EARS from the runtime registration', () => {
    const dir = makeBundledPack('bundled-pack', registration('bundled-pack'), {
      features: { widget: { system: { entry: 'src/x.ts', events: { incoming: ['EXTRA'] } } } },
    });

    const [pack] = loadExternalPacks();
    expect(pack.origin.id).toBe('bundled-pack');
    expect(systemFeatures(pack)).toEqual(['widget']);
    expect(Object.keys(pack.registration.services ?? {})).toEqual(['hello']);
    expect(pack.registration.ears?.entities).toEqual({ Widget: 'Widget' });
    expect(pack.registration.boot?.onInit).toBeTypeOf('function');

    // content live under runtime/content for bundled packs
    const mod = require(path.join(dir, 'runtime', 'index.cjs'));
    expect(mod.compiledDirSeen).toBe(path.join(dir, 'runtime', 'content'));
  });

  it("registers the runtime's content writers and feature settings with the pack", async () => {
    const { registerExternalPacks } = await import('../../../src/packs/runtime/loader.ts');
    const { getPackSettingsDefaults } = await import('@abuddy/sdk/framework');
    const { _contentWriterRegistry } = await import('@abuddy/sdk/content');
    makeBundledPack('settings-pack', registration('settings-pack', `
      contentWriters: { Widget: { find() { return undefined; } } },
      features: { widget: { system: { machine, receives: ['PING'] }, settings: { visible: false, plugins: { widget: { size: 3 } } } } },
    `));

    const [pack] = loadExternalPacks();
    expect(registerExternalPacks(registry, [pack])).toEqual([pack]);
    try {
      expect(_contentWriterRegistry.get('Widget')).toEqual({ find: expect.any(Function) });
      expect(getPackSettingsDefaults().settings).toEqual({ plugins: { 'settings-pack/widget': { size: 3 } } });
      expect(getPackSettingsDefaults().visibility).toEqual({ 'settings-pack/widget': false });
    } finally {
      registry.unregisterPack('settings-pack');
    }
  });

  // Nothing is taken off an installed pack's registration: its boot hooks reach the host as the pack wrote
  // them, like a shipped pack's, both being loaded and written by one path
  it("keeps the pack's registration as the pack wrote it", () => {
    const dir = makeBundledPack('intact-pack', registration('intact-pack'));

    const [pack] = loadExternalPacks();
    expect(pack.registration.boot?.onInit).toBeDefined();

    const exported = (require(path.join(dir, 'runtime', 'index.cjs')) as { registration: PackRegistration }).registration;
    expect(exported.boot?.onInit).toBeDefined();
  });

  // A pack's content are files the host reads with the appliers that pack *registered*; a function the pack
  // puts on `boot` is not a door into applying, and never was
  it("content a pack from its compiled files, never from a function its boot hooks export", async () => {
    const { registerExternalPacks } = await import('../../../src/packs/runtime/loader.ts');
    const dir = makeBundledPack('smuggle-pack', registration('smuggle-pack').replace(
      'onInit() {},',
      'onInit() {}, apply() { module.exports.bootApplyCalls = (module.exports.bootApplyCalls ?? 0) + 1; },',
    ));
    fs.writeFileSync(path.join(dir, 'runtime', 'content', 'actions.content.json'), '[]');

    const packs = loadExternalPacks();
    expect(registerExternalPacks(registry, packs)).toEqual(packs);
    try {
      const applyFn = vi.fn(() => ({}));
      applyPacks(registry.packContentTargets(['smuggle-pack']), applyFn);

      const mod = require(path.join(dir, 'runtime', 'index.cjs'));
      expect(mod.bootApplyCalls, 'the pack smuggled an apply function onto boot and it was called').toBeUndefined();
      expect(applyFn).toHaveBeenCalledTimes(1);
      expect(applyFn).toHaveBeenCalledWith(expect.objectContaining({ compiledDir: path.join(dir, 'runtime', 'content') }));
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
    fs.writeFileSync(path.join(dir, PACK_LAYOUT.integrity), JSON.stringify({ formatVersion: PACK_LAYOUT_VERSION + 1, id: 'future-format', version: '1.0.0', files: {} }));
    expect(loadExternalPacks()).toEqual([]);
  });

  // The layout's format is written by whoever staged the pack; the snapshot's by the CLI that built its runtime, whose
  // registration the loader is about to load. A pack an older CLI built fails in ways that name nothing to act on.
  it.each([
    ['an older', undefined, `its snapshot is format (none), written by an older abuddy CLI (SDK 0.1.0); this AgentBuddy reads format ${PACK_SNAPSHOT_FORMAT}. Rebuild it with the abuddy CLI that matches this AgentBuddy`],
    ['a newer', PACK_SNAPSHOT_FORMAT + 1, `its snapshot is format ${PACK_SNAPSHOT_FORMAT + 1}, written by a newer abuddy CLI (SDK 0.1.0); this AgentBuddy reads format ${PACK_SNAPSHOT_FORMAT}. Update AgentBuddy to use it`],
  ])('skips a pack %s abuddy CLI built, before loading its runtime, saying which side to move', (_side, format, reason) => {
    const dir = makeBundledPack('other-build', 'throw new Error("its runtime was loaded")');
    fs.writeFileSync(path.join(dir, PACK_LAYOUT.snapshot), JSON.stringify({ format, sdkVersion: '0.1.0' }));
    const warnings: string[] = [];
    const unsubscribe = rootEvents.onLog((event) => { if (event.level === 'warn') warnings.push(event.message); });
    try {
      expect(loadExternalPacks()).toEqual([]);
      expect(warnings).toContain(`Skipping other-build: ${reason}`);
    } finally {
      unsubscribe();
    }
  });

});

describe('applyPacks: failures', () => {
  function installedPack(id: string) {
    const dir = path.join(_appDirOf(tmpDir), 'packs', id);
    fs.mkdirSync(path.join(dir, 'runtime', 'content'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'runtime', 'index.cjs'), '');
    fs.writeFileSync(path.join(dir, 'runtime', 'content', 'flows.content.json'), '{}');
    return { manifest: { id }, dir } satisfies PackContentTarget;
  }
  function registryEntry(id: string) {
    const registry = JSON.parse(fs.readFileSync(path.join(_appDirOf(tmpDir), 'installed-packs.json'), 'utf-8'));
    return registry.packs.find((p: any) => p.id === id);
  }
  function writeRegistry(ids: string[]) {
    fs.writeFileSync(path.join(_appDirOf(tmpDir), 'installed-packs.json'), JSON.stringify({
      packs: ids.map(id => ({ id, name: id, version: '1.0.0', dir: '', enabled: true, installedAt: '' })),
    }));
  }

  const failingContent = () => ({ flows: { created: 0, updated: 0, skipped: 0, errors: ['Flow "X" is invalid: missing event'] } });

  it('treats content errors as a failure and records lastError', () => {
    const pack = installedPack('bad-flows');
    writeRegistry(['bad-flows']);

    const failures = applyPacks([pack], failingContent);

    expect(failures).toEqual([{ packId: 'bad-flows', errors: ['flows: Flow "X" is invalid: missing event'] }]);
    expect(registryEntry('bad-flows').lastError).toBe('flows: Flow "X" is invalid: missing event');
  });

  it("doesn't re-import unchanged failing content on every boot, and keeps its lastError", () => {
    const pack = installedPack('bad-flows');
    writeRegistry(['bad-flows']);
    const applyFn = vi.fn(failingContent);

    applyPacks([pack], applyFn);
    applyPacks([pack], applyFn);

    expect(applyFn).toHaveBeenCalledTimes(1);
    expect(registryEntry('bad-flows').lastError).toBe('flows: Flow "X" is invalid: missing event');
  });

  it('re-applies data that matches an earlier successful content after a failed one (rollback)', () => {
    const pack = installedPack('rollback');
    writeRegistry(['rollback']);
    const contentDir = path.join(pack.dir, 'runtime', 'content');
    const applyFn = vi.fn(() => ({}));

    applyPacks([pack], applyFn); // v1 content
    fs.writeFileSync(path.join(contentDir, 'flows.content.json'), '{"v2": {}}');
    applyPacks([pack], failingContent); // v2 fails
    fs.writeFileSync(path.join(contentDir, 'flows.content.json'), '{}');
    applyPacks([pack], applyFn); // back to v1's data

    expect(applyFn).toHaveBeenCalledTimes(2);
    expect(registryEntry('rollback')).not.toHaveProperty('lastError');
  });

  // What makes the retry possible without re-importing on every boot: the hash says the pack's own data is
  // unchanged, and this says what its dependencies were when it failed. A pack that written cleanly has
  // nothing to compare against, so it keeps no entry.
  it('records what a failed apply faced, and keeps nothing once the pack content cleanly', () => {
    const pack = { ...installedPack('records'), manifest: { id: 'records', dependencies: { provider: '^1.0.0' } } };
    writeRegistry(['records']);

    applyPacks([pack], failingContent);
    expect(appState.get().failedAgainst).toEqual({ records: 'provider:' });

    fs.writeFileSync(path.join(pack.dir, 'runtime', 'content', 'flows.content.json'), '{"fixed": {}}');
    applyPacks([pack], () => ({}));

    expect(appState.get().failedAgainst).toEqual({});
  });

  // The failure this is all for: pack B's content reference what pack A content, B written first and failed, and
  // B's own data never changes again — so before this it stayed broken until it was reinstalled.
  it('content a pack again once a pack it depends on has written since it failed', () => {
    const dependency = installedPack('provider');
    const dependent = { ...installedPack('consumer'), manifest: { id: 'consumer', dependencies: { provider: '^1.0.0' } } };
    writeRegistry(['provider', 'consumer']);
    const applyFn = vi.fn(() => ({}));

    // The dependency isn't installed yet, so the dependent content against nothing and fails
    applyPacks([dependent], failingContent);
    expect(registryEntry('consumer').lastError).toBeTruthy();

    // Its own data is unchanged, so on its own it is still skipped
    applyPacks([dependent], applyFn);
    expect(applyFn).not.toHaveBeenCalled();

    // ...until the pack it depends on content, which is the thing that could change the outcome
    applyPacks([dependency, dependent], applyFn);

    expect(applyFn).toHaveBeenCalledTimes(2);
    expect(registryEntry('consumer')).not.toHaveProperty('lastError');
  });

  it('stops retrying a pack that failed once its dependencies settle again', () => {
    const dependency = installedPack('steady');
    const dependent = { ...installedPack('flaky'), manifest: { id: 'flaky', dependencies: { steady: '^1.0.0' } } };
    writeRegistry(['steady', 'flaky']);
    const applyFn = vi.fn(failingContent);

    applyPacks([dependency, dependent], applyFn);
    const attempts = applyFn.mock.calls.length;

    // Nothing has changed since: not the pack's data, and not what it failed against
    applyPacks([dependency, dependent], applyFn);

    expect(applyFn).toHaveBeenCalledTimes(attempts);
    expect(registryEntry('flaky').lastError).toBeTruthy();
  });

  it('forgets what a failed apply faced once the pack has no content to retry', () => {
    const pack = { ...installedPack('withdrawn'), manifest: { id: 'withdrawn', dependencies: { provider: '^1.0.0' } } };
    writeRegistry(['withdrawn']);
    applyPacks([pack], failingContent);
    expect(appState.get().failedAgainst).toHaveProperty('withdrawn');

    fs.rmSync(path.join(pack.dir, 'runtime', 'content'), { recursive: true });
    applyPacks([pack], vi.fn());

    expect(appState.get().failedAgainst).toEqual({});
  });

  it("clears an earlier version's lastError when the pack no longer has content", () => {
    const pack = installedPack('no-more-content');
    fs.rmSync(path.join(pack.dir, 'runtime', 'content'), { recursive: true });
    fs.writeFileSync(path.join(_appDirOf(tmpDir), 'installed-packs.json'), JSON.stringify({
      packs: [{ id: 'no-more-content', name: 'n', version: '1.0.1', dir: '', enabled: true, installedAt: '', lastError: 'v1.0.0 failure' }],
    }));

    applyPacks([pack], vi.fn());

    expect(registryEntry('no-more-content')).not.toHaveProperty('lastError');
  });

  // No content key is the host's: a pack's `settings` content is its own data, like any other key
  it('runs every applier the pack registered, a settings applier included', async () => {
    const { importCompiledContent } = await import('@abuddy/sdk/utils');
    const { testPacks } = await import('@abuddy/sdk/testing');
    const pack = installedPack('with-settings');
    writeRegistry(['with-settings']);
    fs.writeFileSync(path.join(pack.dir, 'runtime', 'content', 'settings.content.json'), '{"plugins": {}}');
    const settingsContent = vi.fn(() => ({ created: 0, updated: 1, skipped: 0 }));
    const actionsContent = vi.fn(() => ({ created: 1, updated: 0, skipped: 0 }));
    fs.writeFileSync(path.join(pack.dir, 'runtime', 'content', 'content.json'), JSON.stringify({ version: 1, packId: 'with-settings', entries: [] }));
    // The appliers its registration carries
    testPacks.appliers.set('with-settings', [{ key: 'settings', apply: settingsContent }, { key: 'actions', apply: actionsContent }]);

    try {
      applyPacks([pack], importCompiledContent);
    } finally {
      testPacks.appliers.delete('with-settings');
    }

    expect(actionsContent).toHaveBeenCalledOnce();
    expect(settingsContent).toHaveBeenCalledOnce();
  });

  it('records a thrown applier as a failure too', () => {
    const pack = installedPack('throws');
    writeRegistry(['throws']);
    const failures = applyPacks([pack], () => { throw new Error('boom'); });
    expect(failures).toEqual([{ packId: 'throws', errors: ['boom'] }]);
    expect(registryEntry('throws').lastError).toBe('boom');
  });

  it('clears lastError after a successful apply', () => {
    const pack = installedPack('recovered');
    fs.writeFileSync(path.join(_appDirOf(tmpDir), 'installed-packs.json'), JSON.stringify({
      packs: [{ id: 'recovered', name: 'r', version: '1.0.0', dir: '', enabled: true, installedAt: '', lastError: 'old failure' }],
    }));
    const failures = applyPacks([pack], () => ({ flows: { created: 1, updated: 0, skipped: 0 } }));
    expect(failures).toEqual([]);
    expect(registryEntry('recovered')).not.toHaveProperty('lastError');
  });

  /** A writer that declares the given keys, writes them, and reports what it was told to */
  const contentDefining = (keys: string[], counts = { created: 1, updated: 0, skipped: 0 }) =>
    (options: { applied?: ApplyRecord }) => {
      seenBefore.push([...(options.applied?.before.keys() ?? [])]);
      for (const key of keys) {
        options.applied?.defined.add(key);
        options.applied?.written.set(key, { entityType: 'Note', parts: { title: key } });
      }
      return { notes: counts };
    };
  let seenBefore: string[][] = [];
  beforeEach(() => { seenBefore = []; });

  /**
   * **What the last apply wrote is what the next one is handed**, which is the half `applyPacks` owns: the
   * writers decide what to do about an item, and this decides what they get to decide it from. It is
   * deliberately what was *written* rather than what the content *declared*: those are different questions,
   * and only the first answers "did we ever put this in the database" — a declared key whose create failed
   * never did.
   */
  it('hands a run what the last one wrote', () => {
    const pack = installedPack('keys');
    writeRegistry(['keys']);

    applyPacks([pack], contentDefining(['keys:notes/a', 'keys:notes/b']));
    // Changed content, or the second run is skipped on its revision
    fs.writeFileSync(path.join(pack.dir, 'runtime', 'content', 'flows.content.json'), '{"v":2}');
    applyPacks([pack], contentDefining(['keys:notes/a', 'keys:notes/b']));

    expect(seenBefore).toEqual([[], ['keys:notes/a', 'keys:notes/b']]);
  });

  /**
   * **An entry stays until the removal pass drops it**, not until the content stops declaring its key: the
   * writer is what decides whether the entity goes, and it reports that as `removed`. An entry dropped here
   * on the strength of the key alone would make a removal indistinguishable from content never shipped.
   */
  it('drops the entry of an item the run reports having removed, and keeps the rest', () => {
    const pack = installedPack('dropped');
    writeRegistry(['dropped']);

    applyPacks([pack], contentDefining(['dropped:notes/a', 'dropped:notes/b']));
    fs.writeFileSync(path.join(pack.dir, 'runtime', 'content', 'flows.content.json'), '{"v":2}');
    applyPacks([pack], (options: { applied?: ApplyRecord }) => {
      options.applied?.defined.add('dropped:notes/a');
      options.applied?.removed.add('dropped:notes/b');
      return { notes: { created: 0, updated: 0, skipped: 0 } };
    });

    expect(Object.keys(appliedContent.get('dropped').items)).toEqual(['dropped:notes/a']);
  });

  /**
   * **An item the content no longer declares that the user edited keeps its entry**, since the entity is
   * still there holding what we wrote: that is what Phase 4 draws the flag from.
   */
  it('keeps the entry of an item the run flagged rather than removed', () => {
    const pack = installedPack('flagged');
    writeRegistry(['flagged']);

    applyPacks([pack], contentDefining(['flagged:notes/a']));
    fs.writeFileSync(path.join(pack.dir, 'runtime', 'content', 'flows.content.json'), '{"v":2}');
    applyPacks([pack], (options: { applied?: ApplyRecord }) => {
      options.applied?.offers.set('flagged:notes/a', { kind: 'removed', parts: ['title'] });
      return { notes: { created: 0, updated: 0, skipped: 0 } };
    });

    expect(Object.keys(appliedContent.get('flagged').items)).toEqual(['flagged:notes/a']);
  });

  /** A writer that reports having written the given items, as the real writers report what they stamped */
  const contentWriting = (items: Record<string, Record<string, string>>, counts = { created: 1, updated: 0, skipped: 0 }) =>
    (options: { applied?: ApplyRecord }) => {
      for (const [key, parts] of Object.entries(items)) options.applied?.written.set(key, { entityType: 'Note', parts });
      return { notes: counts };
    };

  it('records the revision it applied from, which is the hash the skip gate reads', () => {
    const pack = installedPack('rev');
    writeRegistry(['rev']);

    applyPacks([pack], contentWriting({ 'rev:notes/a': { title: 'h1' } }));

    expect(appliedContent.get('rev').revision).toBe(contentRevision(path.join(pack.dir, 'runtime', 'content')));
  });

  /**
   * **The revision is the skip gate, which is why it lives with the items it describes.** A revision
   * recorded without them, or the other way round, is the state in which every item of a pack reads as the
   * user's — so the two move in one write.
   */
  it('skips a pack whose recorded revision is what its content hashes to', () => {
    const pack = installedPack('gate');
    writeRegistry(['gate']);
    const applyFn = vi.fn(contentWriting({ 'gate:notes/a': { title: 'h1' } }));

    applyPacks([pack], applyFn);
    applyPacks([pack], applyFn);
    expect(applyFn, 'the content has not moved, so there is nothing to decide again').toHaveBeenCalledOnce();

    fs.writeFileSync(path.join(pack.dir, 'runtime', 'content', 'flows.content.json'), '{"v":2}');
    applyPacks([pack], applyFn);
    expect(applyFn).toHaveBeenCalledTimes(2);
  });

  /**
   * **The conflict is this phase's whole user-visible value**, so an apply that found one says so: a line
   * per item with the parts that differ, and the content keys in the event's meta for whoever is tracing
   * one. Named rather than keyed — a content key is `%5B%22Action%22...`, which nobody reads.
   */
  it('logs the items with the user’s edits, named, and the keys in the meta', async () => {
    const { onLog } = await import('@abuddy/sdk/logger');
    const pack = installedPack('conflicted');
    writeRegistry(['conflicted']);
    const key = `${'conflicted'}:actions/${encodeURIComponent(JSON.stringify(['Action', 'Echo']))}`;
    const logged: Array<{ message: string; meta?: unknown }> = [];
    const stop = onLog((event) => { logged.push({ message: event.message, ...(event.meta !== undefined && { meta: event.meta }) }); });

    try {
      applyPacks([pack], (options: { applied?: ApplyRecord }) => {
        options.applied?.offers.set(key, { kind: 'update', parts: ['actionFn', 'inputs'], contentHash: 'echo-v2' });
        return { actions: { created: 0, updated: 0, skipped: 1 } };
      });
    } finally {
      stop();
    }

    const entry = logged.find((event) => event.message.includes('have your edits'));
    expect(entry?.message, 'the item, by name, with the parts that differ')
      .toBe('1 of conflicted\'s items have your edits and a newer version waiting:\n  actions / Action "Echo" (actionFn, inputs)');
    expect(entry?.meta).toMatchObject({
      packId: 'conflicted',
      items: { [key]: { kind: 'update', parts: ['actionFn', 'inputs'], contentHash: 'echo-v2' } },
    });
  });

  /**
   * **An item a run did not write keeps the entry the last one gave it**, because the entity still holds what
   * that run wrote. Without the carry-forward the record would describe only the latest run's writes, which
   * is not what it claims to be.
   */
  it('keeps the entry of an item this run did not write', () => {
    const pack = installedPack('carry');
    writeRegistry(['carry']);

    applyPacks([pack], contentWriting({ 'carry:notes/a': { title: 'h1' }, 'carry:notes/b': { title: 'h2' } }));
    fs.writeFileSync(path.join(pack.dir, 'runtime', 'content', 'flows.content.json'), '{"v":2}');
    applyPacks([pack], contentWriting({ 'carry:notes/a': { title: 'h1-changed' } }));

    expect(appliedContent.get('carry').items).toEqual({
      'carry:notes/a': { entityType: 'Note', parts: { title: 'h1-changed' } },
      'carry:notes/b': { entityType: 'Note', parts: { title: 'h2' } },
    });
  });

  /**
   * **A run that failed still wrote whatever it got through**, and the revision has already moved with them,
   * so nothing will re-import those items until the content changes again. Leaving them out would make a
   * later apply read every one of them as the user's.
   */
  it('records what a failed run wrote, since its writes landed anyway', () => {
    const pack = installedPack('partial');
    writeRegistry(['partial']);

    applyPacks([pack], contentWriting({ 'partial:notes/a': { title: 'h1' } }, { created: 1, updated: 0, skipped: 1, errors: ['the next one failed'] } as never));

    expect(appliedContent.get('partial').items).toEqual({ 'partial:notes/a': { entityType: 'Note', parts: { title: 'h1' } } });
  });

  it('records nothing for a pack with no content', () => {
    const pack = installedPack('empty');
    fs.rmSync(path.join(pack.dir, 'runtime', 'content'), { recursive: true });
    writeRegistry(['empty']);

    applyPacks([pack], vi.fn());

    expect(appliedContent.get('empty')).toEqual({ revision: '', items: {} });
  });

  /** A pack id holds a dash, and an entity's type is the text before its first one */
  it('records a pack whose id holds a dash', () => {
    const pack = installedPack('default-setup');
    writeRegistry(['default-setup']);

    applyPacks([pack], contentWriting({ 'default-setup:notes/a': { title: 'h1' } }));

    expect(Object.keys(appliedContent.get('default-setup').items)).toEqual(['default-setup:notes/a']);
  });
});

describe('applyPacks', () => {
  function makePackWithContent(
    packsDir: string,
    id: string,
    artifacts?: Record<string, any>,
  ) {
    const packDir = path.join(packsDir, id);
    const distDir = path.join(packDir, 'runtime', 'content');
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

  it('calls applyFn for packs with compiled content in runtime/content', () => {
    const packsDir = path.join(_appDirOf(tmpDir), 'packs');
    const pack = makePackWithContent(packsDir, 'data-pack', {
      [contentFile('actions')]: [{ label: 'test-action', actionFn: 'return true' }],
    });

    const applyFn = vi.fn().mockReturnValue({});

    applyPacks([pack], applyFn);

    expect(applyFn).toHaveBeenCalledOnce();
    // No `include`: every key a pack declares is applied. What an apply leaves alone it decides from the
    // merge over what it last wrote, what the content says now and what the database holds; never from a
    // policy naming keys
    expect(applyFn).toHaveBeenCalledWith({
      compiledDir: path.join(pack.dir, 'runtime', 'content'),
      mode: 'replace-on-collision',
      applied: {
        before: new Map(), defined: new Set(), written: new Map(),
        removed: new Set(), offers: new Map(),
      },
    });
  });

  it('skips packs without runtime/content', () => {
    const packDir = path.join(_appDirOf(tmpDir), 'packs', 'no-dist');
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({
      id: 'no-dist', name: 'No Dist', version: '1.0.0',
    }));

    const pack = {
      manifest: { id: 'no-dist', name: 'No Dist', version: '1.0.0' },
      dir: packDir,
      systems: new Map(),
    } as any;

    const applyFn = vi.fn().mockReturnValue({});
    applyPacks([pack], applyFn);

    expect(applyFn).not.toHaveBeenCalled();
  });

  it('skips packs whose recorded revision has not changed', () => {
    const packsDir = path.join(_appDirOf(tmpDir), 'packs');
    const pack = makePackWithContent(packsDir, 'cached-pack', {
      [contentFile('actions')]: [{ label: 'cached' }],
    });

    const distDir = path.join(pack.dir, 'runtime', 'content');
    appliedContent.record('cached-pack', { revision: contentRevision(distDir), wrote: new Map() });

    const applyFn = vi.fn().mockReturnValue({});
    applyPacks([pack], applyFn);

    expect(applyFn).not.toHaveBeenCalled();
  });

  it('re-applies when pack content changes', () => {
    const packsDir = path.join(_appDirOf(tmpDir), 'packs');
    const pack = makePackWithContent(packsDir, 'updated-pack', {
      [contentFile('actions')]: [{ label: 'v1' }],
    });

    appliedContent.record('updated-pack', { revision: 'old-hash', wrote: new Map() });
    appliedContent.record('disabled-pack', { revision: 'its-hash', wrote: new Map() });
    const applyFn = vi.fn().mockReturnValue({});

    applyPacks([pack], applyFn);

    expect(applyFn).toHaveBeenCalledOnce();
    expect(appliedContent.get('updated-pack').revision).toBe(contentRevision(path.join(pack.dir, 'runtime', 'content')));
    // A pack not loaded this boot (disabled) keeps its revision, so enabling it doesn't re-apply its content
    expect(appliedContent.get('disabled-pack').revision).toBe('its-hash');
  });

  it('continues applying other packs when one fails', () => {
    const packsDir = path.join(_appDirOf(tmpDir), 'packs');
    const pack1 = makePackWithContent(packsDir, 'fail-pack', {
      [contentFile('actions')]: [{ label: 'will-fail' }],
    });
    const pack2 = makePackWithContent(packsDir, 'ok-pack', {
      [contentFile('actions')]: [{ label: 'will-succeed' }],
    });

    let callCount = 0;
    const applyFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error('content failed');
      return {};
    });

    applyPacks([pack1, pack2], applyFn);

    expect(applyFn).toHaveBeenCalledTimes(2);
    // A failed content's revision is recorded too, so the same failing data isn't retried every boot
    expect(appliedContent.get('fail-pack').revision).toEqual(expect.any(String));
    expect(appliedContent.get('ok-pack').revision).toEqual(expect.any(String));
  });
});

describe('contentRevision', () => {
  it('returns empty string for a directory with no content files', () => {
    const emptyDir = path.join(tmpDir, 'empty-dist');
    fs.mkdirSync(emptyDir, { recursive: true });
    expect(contentRevision(emptyDir)).toBe('');
  });

  it('returns the same hash for files nothing has touched', () => {
    const distDir = path.join(tmpDir, 'hash-test');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, contentFile('actions')), '[]');

    const hash1 = contentRevision(distDir);
    const hash2 = contentRevision(distDir);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe('');
  });

  // The names as well as the bytes, which is the half a byte-only hash would miss: the same records moved from one
  // content file to another are a different applying, and nothing else here tells those apart — adding or changing a
  // file moves the bytes too, so only a rename isolates it.
  it('changes when the same bytes move to a different file', () => {
    const distDir = path.join(tmpDir, 'hash-renamed');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, contentFile('actions')), '[{"label":"same"}]');
    const before = contentRevision(distDir);

    fs.rmSync(path.join(distDir, contentFile('actions')));
    fs.writeFileSync(path.join(distDir, contentFile('prompts')), '[{"label":"same"}]');

    expect(contentRevision(distDir)).not.toBe(before);
  });

  // **The hash is content, so a rewrite with the same bytes is not a change.** It used to be: file times were in
  // here so that reinstalling a pack would re-apply it, since `placePack` replaces every file. That made a `touch`
  // re-apply too, and made every `abuddy dev` backend rebuild re-import every item, because that loop reinstalls.
  // Asking for a pack's data to be put back is `IMPORT_PACK_CONTENT` now, which says so.
  it('returns the same hash when the same bytes are put back in new files', () => {
    const distDir = path.join(tmpDir, 'hash-replaced');
    fs.mkdirSync(distDir, { recursive: true });
    const file = path.join(distDir, contentFile('actions'));
    fs.writeFileSync(file, '[{"label":"same"}]');
    const before = contentRevision(distDir);

    // What placePack leaves behind: the same content, in a file that wasn't there a moment ago
    fs.writeFileSync(file, '[{"label":"same"}]');
    const replaced = new Date(Date.now() + 5_000);
    fs.utimesSync(file, replaced, replaced);

    expect(contentRevision(distDir)).toBe(before);
  });

  // The same property through a real install, which is the one that used to carry the old contract: `placePack`
  // really does leave new files, and that is now not a reason to apply again
  it('does not change after installing the same pack source over itself', async () => {
    const { installPackFromLocal } = await import('../../../src/packs/installer.ts');
    const source = path.join(tmpDir, 'reinstall-source');
    fs.mkdirSync(path.join(source, 'dist', 'runtime', 'content'), { recursive: true });
    fs.writeFileSync(path.join(source, 'abuddy.json'), JSON.stringify({ id: 'reinstalled', name: 'R', version: '1.0.0' }));
    fs.writeFileSync(path.join(source, 'dist', 'runtime', 'index.cjs'), 'module.exports = {};');
    fs.mkdirSync(path.join(source, 'dist', 'types'), { recursive: true });
    fs.writeFileSync(path.join(source, 'dist', PACK_LAYOUT.snapshot), JSON.stringify({ format: PACK_SNAPSHOT_FORMAT }));
    fs.writeFileSync(path.join(source, 'dist', 'runtime', 'content', contentFile('actions')), '[{"label":"same"}]');

    const packsDir = path.join(_appDirOf(tmpDir), 'packs');
    const { dir } = await installPackFromLocal(source, packsDir);
    const content = path.join(dir, 'runtime', 'content');
    const before = contentRevision(content);

    await installPackFromLocal(source, packsDir);

    expect(contentRevision(content), 'a reinstall of identical bytes read as changed data').toBe(before);
  });

  it('returns different hash when content changes', () => {
    const distDir = path.join(tmpDir, 'hash-change');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, contentFile('actions')), '[{"label":"v1"}]');
    const hash1 = contentRevision(distDir);

    fs.writeFileSync(path.join(distDir, contentFile('actions')), '[{"label":"v2"}]');
    const hash2 = contentRevision(distDir);

    expect(hash1).not.toBe(hash2);
  });

  it('hashes any JSON file, not just known artifact types', () => {
    const distDir = path.join(tmpDir, 'custom-artifacts');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, 'compiled-widgets.json'), '[{"id":"w1"}]');

    const hash = contentRevision(distDir);
    expect(hash).not.toBe('');
  });

  // **Everything in the pack's content directory, media included.** The directory holds what `abuddy build`
  // compiled there and nothing else, so there is no file kind to exclude — and a changed image is changed
  // content, which a hash over `.json` alone called unchanged
  it('hashes every file under the content directory, media and all', () => {
    const contentDir = path.join(tmpDir, 'with-media');
    fs.mkdirSync(contentDir, { recursive: true });
    expect(contentRevision(contentDir), 'an empty directory has nothing to apply').toBe('');

    fs.writeFileSync(path.join(contentDir, 'notes.content.json'), '[]');
    const withoutMedia = contentRevision(contentDir);
    expect(withoutMedia).not.toBe('');

    fs.mkdirSync(path.join(contentDir, 'media', 'notes'), { recursive: true });
    fs.writeFileSync(path.join(contentDir, 'media', 'notes', 'diagram.png'), 'first');
    const withMedia = contentRevision(contentDir);
    expect(withMedia, 'a media file is content').not.toBe(withoutMedia);

    fs.writeFileSync(path.join(contentDir, 'media', 'notes', 'diagram.png'), 'second');
    expect(contentRevision(contentDir), "a media file's content is content").not.toBe(withMedia);
  });
});

describe('loaded packs: the packs.loaded entries', () => {
  // Every pack is listed, with the files the renderer fetches its frontend from when it has them. A pack
  // the app ships keeps its built files in `dist/`, which is the only thing that differs
  it('lists every pack, with where to fetch each frontend from', () => {
    const withFrontend = path.join(tmpDir, 'with-fe');
    fs.mkdirSync(path.join(withFrontend, 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(withFrontend, 'runtime', 'fe.js'), '');
    fs.writeFileSync(path.join(withFrontend, 'runtime', 'fe.css'), '');
    const backendOnly = path.join(tmpDir, 'be-only');
    fs.mkdirSync(backendOnly);
    // A pack the app ships, in the same layout as any other: it is installed
    const shipped = path.join(tmpDir, 'shipped');
    fs.mkdirSync(path.join(shipped, 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(shipped, 'runtime', 'fe.js'), '');
    const pack = (id: string, dir: string) => ({ id, name: id, version: '2.0.0', dir, shipped: false });
    const loaded = {
      loadedPacks: () => [
        { id: 'shipped-pack', name: 'Shipped', version: '1.0.0', dir: shipped, shipped: true },
        pack('with-fe', withFrontend),
        pack('be-only', backendOnly),
      ],
    };

    expect(getLoadedPackEntries(loaded)).toEqual([
      { id: 'shipped-pack', name: 'Shipped', version: '1.0.0', feEntry: 'runtime/fe.js', feStyles: undefined, feRevision: expect.stringMatching(/^[0-9a-f]{16}$/) },
      { id: 'with-fe', name: 'with-fe', version: '2.0.0', feEntry: 'runtime/fe.js', feStyles: 'runtime/fe.css', feRevision: expect.stringMatching(/^[0-9a-f]{16}$/) },
      // Listed with no frontend files: it has systems the renderer must know are running
      { id: 'be-only', name: 'be-only', version: '2.0.0' },
    ]);
  });

  // The renderer loads the frontend from URLs carrying it, which the browser caches by: an update or an `abuddy dev`
  // rebuild keeps its version, so the revision follows the files
  it("gives a frontend a revision that changes with its files, and only with them", () => {
    const dir = path.join(tmpDir, 'with-fe');
    fs.mkdirSync(path.join(dir, 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'runtime', 'fe.js'), 'export default {};');
    const loaded = { shippedPacks: () => [], loadedPacks: () => [{ id: 'with-fe', name: 'with-fe', version: '2.0.0', dir, shipped: false }] };
    const revision = () => getLoadedPackEntries(loaded)[0].feRevision;

    const first = revision();
    expect(revision()).toBe(first);
    fs.writeFileSync(path.join(dir, 'runtime', 'fe.js'), 'export default { features: {} };');
    expect(revision()).not.toBe(first);
  });
});
