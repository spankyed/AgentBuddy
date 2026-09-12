import { vi } from 'vitest';
import { registerHostModule } from '@abuddy/sdk/runtime';

vi.mock('virtual:built-in-pack-loaders', () => ({
  default: {},
}));

const noop = () => {};
const noopLogger = { debug: noop, info: noop, warn: noop, error: noop };
registerHostModule('logger', {
  createLogger: () => noopLogger,
  LogEvent: {},
});

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadExternalPacks, seedPackData, computePackSeedHash } from '@/packs/pack-loader';
import { setLoadedPacks } from '@/packs/pack-api';
import { rootEvents } from '@/core/router/bus-emitter';
import { seedFile } from '@abuddy/sdk/build';

let tmpDir: string;
let origEnv: { env?: string; userDataDir?: string };

function makePack(
  packsDir: string,
  id: string,
  manifest: Record<string, unknown>,
  systemCode?: string,
) {
  const packDir = path.join(packsDir, id);
  fs.mkdirSync(path.join(packDir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify(manifest));
  if (systemCode) {
    fs.writeFileSync(path.join(packDir, 'dist', 'system.cjs'), systemCode);
  }
  return packDir;
}

beforeEach(() => {
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

    it('discovers and loads a valid pack with a CJS system', () => {
      const packsDir = path.join(tmpDir, 'packs');

      const systemCode = `
        module.exports = {
          default: { id: 'test-system', initial: 'idle', states: { idle: {} } },
        };
      `;

      makePack(packsDir, 'test-pack', {
        id: 'test-pack',
        name: 'Test Pack',
        version: '1.0.0',
        features: [{
          id: 'my-feature',
          system: {
            entry: 'dist/system.cjs',
            events: { incoming: ['DO_THING'] },
          },
        }],
      }, systemCode);

      const result = loadExternalPacks();

      expect(result).toHaveLength(1);
      expect(result[0].manifest.id).toBe('test-pack');
      expect(result[0].systems.has('my-feature')).toBe(true);
      expect(result[0].systems.get('my-feature')!.events.has('DO_THING')).toBe(true);
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

    it('rejects system entries that escape pack directory', () => {
      makePack(path.join(tmpDir, 'packs'), 'escape-pack', {
        id: 'escape-pack',
        name: 'Escape',
        version: '1.0.0',
        features: [{
          id: 'bad-feature',
          system: { entry: '../../etc/passwd' },
        }],
      });
      const result = loadExternalPacks();
      expect(result).toHaveLength(1);
      expect(result[0].systems.size).toBe(0);
    });

    it('handles packs with no features array', () => {
      makePack(path.join(tmpDir, 'packs'), 'data-pack', {
        id: 'data-pack',
        name: 'Data Only',
        version: '1.0.0',
      });
      const result = loadExternalPacks();
      expect(result).toHaveLength(1);
      expect(result[0].systems.size).toBe(0);
    });

    it('handles features without system entry', () => {
      makePack(path.join(tmpDir, 'packs'), 'fe-only', {
        id: 'fe-only',
        name: 'Frontend Only',
        version: '1.0.0',
        features: [{
          id: 'widget',
          plugin: { entry: 'dist/plugin.js', label: 'Widget', icon: 'Zap' },
        }],
      });
      const result = loadExternalPacks();
      expect(result).toHaveLength(1);
      expect(result[0].systems.size).toBe(0);
    });

    it('gracefully handles system that fails to load', () => {
      const packsDir = path.join(tmpDir, 'packs');
      const packDir = makePack(packsDir, 'broken', {
        id: 'broken',
        name: 'Broken',
        version: '1.0.0',
        features: [{
          id: 'bad-system',
          system: { entry: 'dist/system.cjs' },
        }],
      });
      // Write invalid JS
      fs.writeFileSync(path.join(packDir, 'dist', 'system.cjs'), 'this is not valid javascript %%%');

      const result = loadExternalPacks();
      expect(result).toHaveLength(1);
      expect(result[0].systems.size).toBe(0);
    });

    it('handles system module with no recognizable export', () => {
      const packsDir = path.join(tmpDir, 'packs');
      // The manifest points at TypeScript source; the loader runs the compiled dist/systems/<id>.cjs
      const packDir = makePack(packsDir, 'no-export', {
        id: 'no-export',
        name: 'No Export',
        version: '1.0.0',
        features: [{
          id: 'empty',
          system: { entry: 'src/features/empty/be/system.ts' },
        }],
      });
      fs.mkdirSync(path.join(packDir, 'dist', 'systems'), { recursive: true });
      fs.writeFileSync(path.join(packDir, 'dist', 'systems', 'empty.cjs'), 'module.exports = { someRandomThing: 42 };');

      const warnings: string[] = [];
      const unsubscribe = rootEvents.onLog(event => {
        if (event.level === 'warn' && event.source === 'pack-loader') warnings.push(event.message);
      });
      try {
        const result = loadExternalPacks();
        expect(result).toHaveLength(1);
        expect(result[0].systems.size).toBe(0);
        // Names the file actually loaded (the compiled .cjs) and what it did export
        expect(warnings).toContain(
          'No machine export found in dist/systems/empty.cjs: expected a default export (or `system`/`machine`), found someRandomThing',
        );
      } finally {
        unsubscribe();
      }
    });
  });

});

describe('pack-loader: bundled runtime (runtime/index.cjs)', () => {
  function makeBundledPack(id: string, registrationSource: string, manifestExtra: Record<string, unknown> = {}) {
    const packDir = path.join(tmpDir, 'packs', id);
    fs.mkdirSync(path.join(packDir, 'runtime', 'seeds'), { recursive: true });
    fs.mkdirSync(path.join(packDir, 'types'), { recursive: true });
    fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({ id, name: id, version: '1.0.0', ...manifestExtra }));
    fs.writeFileSync(path.join(packDir, 'bundle.json'), JSON.stringify({ formatVersion: 1, id, version: '1.0.0', files: {} }));
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
        systems: [{ id: 'widget', machine, events: new Set(['PING']) }],
        services: { hello: () => 'hi' },
        ears: {
          entities: { Widget: 'Widget' },
          relKinds: {},
          partitionPolicy: { excludedEntityTypes: [], secretEntityTypes: [] },
        },
        boot: {
          onInit() {},
          seedManifest: { artifacts: ['actions'], get compiledDir() { return compiledDir; } },
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
    expect(pack.manifest.id).toBe('bundled-pack');
    expect([...pack.systems.keys()]).toEqual(['widget']);
    expect([...pack.systems.get('widget')!.events].sort()).toEqual(['EXTRA', 'PING']);
    expect(Object.keys(pack.services ?? {})).toEqual(['hello']);
    expect(pack.ears?.entities).toEqual({ Widget: 'Widget' });
    expect(pack.boot?.onInit).toBeTypeOf('function');

    // seeds live under runtime/seeds for bundled packs
    const mod = require(path.join(dir, 'runtime', 'index.cjs'));
    expect(mod.compiledDirSeen).toBe(path.join(dir, 'runtime', 'seeds'));
  });

  it('strips the declarative boot seed and an empty partition policy', () => {
    makeBundledPack('strip-pack', registration('strip-pack'));
    const [pack] = loadExternalPacks();
    expect(pack.boot?.seedManifest).toBeUndefined();
    expect(pack.ears?.partitionPolicy).toBeUndefined();
  });

  it('refuses a runtime whose registration id does not match the manifest', () => {
    makeBundledPack('real-id', registration('other-id'));
    expect(loadExternalPacks()).toEqual([]);
  });

  it('refuses a bundle format this host does not support', () => {
    const dir = makeBundledPack('future-format', registration('future-format'));
    fs.writeFileSync(path.join(dir, 'bundle.json'), JSON.stringify({ formatVersion: 2, id: 'future-format', version: '1.0.0', files: {} }));
    expect(loadExternalPacks()).toEqual([]);
  });

  it('seeds from runtime/seeds', () => {
    const dir = makeBundledPack('seed-bundle', registration('seed-bundle'));
    fs.writeFileSync(path.join(dir, 'runtime', 'seeds', 'actions.seed.json'), '[]');
    const packs = loadExternalPacks();
    const seedFn = vi.fn(() => ({}));
    seedPackData(packs, seedFn, () => ({}), () => {});
    expect(seedFn).toHaveBeenCalledWith(expect.objectContaining({ compiledDir: path.join(dir, 'runtime', 'seeds') }));
  });
});

describe('seedPackData: failures', () => {
  function installedPack(id: string) {
    const dir = path.join(tmpDir, 'packs', id);
    fs.mkdirSync(path.join(dir, 'runtime', 'seeds'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'runtime', 'index.cjs'), '');
    fs.writeFileSync(path.join(dir, 'runtime', 'seeds', 'flows.seed.json'), '{}');
    return { manifest: { id, name: id, version: '1.0.0' }, dir, systems: new Map() } as any;
  }
  function registryEntry(id: string) {
    const registry = JSON.parse(fs.readFileSync(path.join(tmpDir, 'pack-registry.json'), 'utf-8'));
    return registry.packs.find((p: any) => p.id === id);
  }
  function writeRegistry(ids: string[]) {
    fs.writeFileSync(path.join(tmpDir, 'pack-registry.json'), JSON.stringify({
      packs: ids.map(id => ({ id, name: id, version: '1.0.0', dir: '', enabled: true, registeredAt: '' })),
    }));
  }

  it('treats seed errors as a failure: no stored hash, lastError recorded', () => {
    const pack = installedPack('bad-flows');
    writeRegistry(['bad-flows']);
    const setHashes = vi.fn();

    const failures = seedPackData(
      [pack],
      () => ({ flows: { created: 0, updated: 0, skipped: 0, errors: ['Flow "X" is invalid: missing event'] } }),
      () => ({}),
      setHashes,
    );

    expect(failures).toEqual([{ packId: 'bad-flows', errors: ['flows: Flow "X" is invalid: missing event'] }]);
    expect(setHashes).not.toHaveBeenCalled();
    expect(registryEntry('bad-flows').lastError).toBe('flows: Flow "X" is invalid: missing event');
  });

  it('records a thrown seeder as a failure too', () => {
    const pack = installedPack('throws');
    writeRegistry(['throws']);
    const failures = seedPackData([pack], () => { throw new Error('boom'); }, () => ({}), () => {});
    expect(failures).toEqual([{ packId: 'throws', errors: ['boom'] }]);
    expect(registryEntry('throws').lastError).toBe('boom');
  });

  it('clears lastError after a successful seed', () => {
    const pack = installedPack('recovered');
    fs.writeFileSync(path.join(tmpDir, 'pack-registry.json'), JSON.stringify({
      packs: [{ id: 'recovered', name: 'r', version: '1.0.0', dir: '', enabled: true, registeredAt: '', lastError: 'old failure' }],
    }));
    const failures = seedPackData([pack], () => ({ flows: { created: 1, updated: 0, skipped: 0 } }), () => ({}), () => {});
    expect(failures).toEqual([]);
    expect(registryEntry('recovered')).not.toHaveProperty('lastError');
  });
});

describe('seedPackData', () => {
  function makePackWithDist(
    packsDir: string,
    id: string,
    artifacts?: Record<string, any>,
  ) {
    const packDir = path.join(packsDir, id);
    const distDir = path.join(packDir, 'dist');
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

  it('calls seedFn for packs with dist artifacts', () => {
    const packsDir = path.join(tmpDir, 'packs');
    const pack = makePackWithDist(packsDir, 'data-pack', {
      [seedFile('actions')]: [{ label: 'test-action', actionFn: 'return true' }],
    });

    const seedFn = vi.fn().mockReturnValue({});
    let stored: Record<string, string> = {};

    seedPackData(
      [pack],
      seedFn,
      () => stored,
      (h) => { stored = h; },
    );

    expect(seedFn).toHaveBeenCalledOnce();
    expect(seedFn).toHaveBeenCalledWith({
      compiledDir: path.join(pack.dir, 'dist'),
      mode: 'replace-on-collision',
    });
  });

  it('skips packs with no dist directory', () => {
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
    seedPackData([pack], seedFn, () => ({}), () => {});

    expect(seedFn).not.toHaveBeenCalled();
  });

  it('skips packs whose seed hash has not changed', () => {
    const packsDir = path.join(tmpDir, 'packs');
    const pack = makePackWithDist(packsDir, 'cached-pack', {
      [seedFile('actions')]: [{ label: 'cached' }],
    });

    const distDir = path.join(pack.dir, 'dist');
    const hash = computePackSeedHash(distDir);
    const stored: Record<string, string> = { 'cached-pack': hash };

    const seedFn = vi.fn().mockReturnValue({});
    seedPackData([pack], seedFn, () => stored, () => {});

    expect(seedFn).not.toHaveBeenCalled();
  });

  it('re-seeds when pack content changes', () => {
    const packsDir = path.join(tmpDir, 'packs');
    const pack = makePackWithDist(packsDir, 'updated-pack', {
      [seedFile('actions')]: [{ label: 'v1' }],
    });

    const stored: Record<string, string> = { 'updated-pack': 'old-hash' };
    const seedFn = vi.fn().mockReturnValue({});
    let savedHashes: Record<string, string> = {};

    seedPackData(
      [pack],
      seedFn,
      () => stored,
      (h) => { savedHashes = h; },
    );

    expect(seedFn).toHaveBeenCalledOnce();
    expect(savedHashes['updated-pack']).toBeTruthy();
    expect(savedHashes['updated-pack']).not.toBe('old-hash');
  });

  it('removes hashes for uninstalled packs', () => {
    const stored = { 'removed-pack': 'some-hash', 'another-removed': 'hash2' };
    let savedHashes: Record<string, string> = {};

    seedPackData(
      [],
      vi.fn().mockReturnValue({}),
      () => stored,
      (h) => { savedHashes = h; },
    );

    expect(savedHashes).toEqual({});
  });

  it('continues seeding other packs when one fails', () => {
    const packsDir = path.join(tmpDir, 'packs');
    const pack1 = makePackWithDist(packsDir, 'fail-pack', {
      [seedFile('actions')]: [{ label: 'will-fail' }],
    });
    const pack2 = makePackWithDist(packsDir, 'ok-pack', {
      [seedFile('actions')]: [{ label: 'will-succeed' }],
    });

    let callCount = 0;
    const seedFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error('seed failed');
      return {};
    });
    let savedHashes: Record<string, string> = {};

    seedPackData(
      [pack1, pack2],
      seedFn,
      () => ({}),
      (h) => { savedHashes = h; },
    );

    expect(seedFn).toHaveBeenCalledTimes(2);
    expect(savedHashes['fail-pack']).toBeUndefined();
    expect(savedHashes['ok-pack']).toBeTruthy();
  });
});

describe('computePackSeedHash', () => {
  it('returns empty string for a directory with no seed files', () => {
    const emptyDir = path.join(tmpDir, 'empty-dist');
    fs.mkdirSync(emptyDir, { recursive: true });
    expect(computePackSeedHash(emptyDir)).toBe('');
  });

  it('returns consistent hash for the same content', () => {
    const distDir = path.join(tmpDir, 'hash-test');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, seedFile('actions')), '[]');

    const hash1 = computePackSeedHash(distDir);
    const hash2 = computePackSeedHash(distDir);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
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

describe('pack-api', () => {
  it('setLoadedPacks is callable without error', () => {
    expect(() => setLoadedPacks([{
      manifest: {
        id: 'demo-pack',
        name: 'Demo Pack',
        version: '2.0.0',
        features: [
          {
            id: 'widget',
            plugin: { entry: 'dist/plugin.js', label: 'Widget', icon: 'Zap' },
          },
        ],
      },
      dir: '/tmp/demo',
      systems: new Map(),
    } as any])).not.toThrow();
  });
});
