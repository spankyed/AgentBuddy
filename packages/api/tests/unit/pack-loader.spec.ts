import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadExternalPacks, registerPackSystems } from '@/core/packs/pack-loader';
import { setLoadedPacks } from '@/core/packs/pack-api';

let tmpDir: string;
let origUserDataPath: string | undefined;

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
  origUserDataPath = process.env.USER_DATA_PATH;
  process.env.USER_DATA_PATH = tmpDir;
});

afterEach(() => {
  if (origUserDataPath === undefined) {
    delete process.env.USER_DATA_PATH;
  } else {
    process.env.USER_DATA_PATH = origUserDataPath;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('pack-loader', () => {
  describe('loadExternalPacks', () => {
    it('returns empty array when packs dir does not exist', () => {
      process.env.USER_DATA_PATH = path.join(tmpDir, 'nonexistent');
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
      makePack(packsDir, 'no-export', {
        id: 'no-export',
        name: 'No Export',
        version: '1.0.0',
        features: [{
          id: 'empty',
          system: { entry: 'dist/system.cjs' },
        }],
      }, 'module.exports = { someRandomThing: 42 };');

      const result = loadExternalPacks();
      expect(result).toHaveLength(1);
      expect(result[0].systems.size).toBe(0);
    });
  });

  describe('registerPackSystems', () => {
    it('adds systems to the systems map and event validation map', () => {
      const systemsMap: Record<string, any> = {};
      const eventValidationMap = new Map<string, Set<string>>();
      const mockMachine = { id: 'test' };
      const mockEvents = new Set(['EVENT_A', 'EVENT_B']);

      const packs: any[] = [{
        manifest: { id: 'my-pack', name: 'My Pack', version: '1.0.0' },
        dir: '/tmp/fake',
        systems: new Map([['feature-a', { machine: mockMachine, events: mockEvents }]]),
      }];

      registerPackSystems(packs, systemsMap, eventValidationMap);

      expect(systemsMap['my-pack.feature-a']).toBe(mockMachine);
      expect(eventValidationMap.get('my-pack.feature-a')).toEqual(mockEvents);
    });

    it('registers multiple features from multiple packs', () => {
      const systemsMap: Record<string, any> = {};
      const eventValidationMap = new Map<string, Set<string>>();

      const packs: any[] = [
        {
          manifest: { id: 'pack-a', name: 'A', version: '1.0.0' },
          dir: '/tmp/a',
          systems: new Map([
            ['feat-1', { machine: { id: 'a1' }, events: new Set(['X']) }],
            ['feat-2', { machine: { id: 'a2' }, events: new Set(['Y']) }],
          ]),
        },
        {
          manifest: { id: 'pack-b', name: 'B', version: '1.0.0' },
          dir: '/tmp/b',
          systems: new Map([
            ['feat-1', { machine: { id: 'b1' }, events: new Set(['Z']) }],
          ]),
        },
      ];

      registerPackSystems(packs, systemsMap, eventValidationMap);

      expect(Object.keys(systemsMap)).toEqual(['pack-a.feat-1', 'pack-a.feat-2', 'pack-b.feat-1']);
      expect(eventValidationMap.size).toBe(3);
    });
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
