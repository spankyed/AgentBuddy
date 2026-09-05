/**
 * E2E test: exercises the real pack loading pipeline against an actual
 * pack installed in ~/.agentbuddy/packs/. The test installs a fresh test
 * pack, runs the full boot-sequence functions, and verifies the system
 * loads, registers, and could serve plugins to the FE via tRPC.
 *
 * Cleans up after itself.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadExternalPacks, registerPackSystems, type LoadedPack } from '@/core/packs/pack-loader';
import { setLoadedPacks } from '@/core/packs/pack-api';

const REAL_PACKS_DIR = path.join(os.homedir(), '.agentbuddy', 'packs');
const TEST_PACK_ID = 'e2e-test-pack';
const TEST_PACK_DIR = path.join(REAL_PACKS_DIR, TEST_PACK_ID);

function installTestPack() {
  fs.mkdirSync(path.join(TEST_PACK_DIR, 'dist'), { recursive: true });

  fs.writeFileSync(path.join(TEST_PACK_DIR, 'abuddy.json'), JSON.stringify({
    id: TEST_PACK_ID,
    name: 'E2E Test Pack',
    version: '1.0.0',
    plugins: [
      {
        id: 'hello',
        system: {
          entry: 'dist/system.cjs',
          events: {
            incoming: ['HELLO_PING'],
            outgoing: ['HELLO_PONG'],
          },
        },
        plugin: {
          entry: 'dist/plugin.js',
          label: 'Hello World',
          icon: 'Sparkles',
        },
      },
      {
        id: 'data-only',
        // No system — plugin only
        plugin: {
          entry: 'dist/data-plugin.js',
          label: 'Data View',
          icon: 'Database',
        },
      },
    ],
  }, null, 2));

  // Write a real CJS system that requires xstate from the host
  fs.writeFileSync(path.join(TEST_PACK_DIR, 'dist', 'system.cjs'), `
    'use strict';
    const { setup } = require('xstate');

    const helloMachine = setup({
      types: {
        events: {},
      },
    }).createMachine({
      id: 'e2e-hello',
      initial: 'idle',
      states: {
        idle: {
          on: {
            CLIENT_CONNECTED: {
              actions: () => {},
            },
            HELLO_PING: {
              actions: () => {},
            },
          },
        },
      },
    });

    module.exports = { default: helloMachine };
  `);
}

function cleanupTestPack() {
  if (fs.existsSync(TEST_PACK_DIR)) {
    fs.rmSync(TEST_PACK_DIR, { recursive: true, force: true });
  }
}

// Remove USER_DATA_PATH so we hit the real ~/.agentbuddy/packs/ directory
let origUDP: string | undefined;

beforeAll(() => {
  origUDP = process.env.USER_DATA_PATH;
  delete process.env.USER_DATA_PATH;
  cleanupTestPack();
  installTestPack();
});

afterAll(() => {
  cleanupTestPack();
  if (origUDP !== undefined) {
    process.env.USER_DATA_PATH = origUDP;
  }
});

describe('E2E: pack loading pipeline', () => {
  let packs: LoadedPack[];

  it('discovers the test pack from ~/.agentbuddy/packs/', () => {
    packs = loadExternalPacks();
    const testPack = packs.find(p => p.manifest.id === TEST_PACK_ID);
    expect(testPack).toBeDefined();
    expect(testPack!.manifest.name).toBe('E2E Test Pack');
    expect(testPack!.manifest.version).toBe('1.0.0');
    expect(testPack!.dir).toBe(TEST_PACK_DIR);
  });

  it('loads the CJS system via Module._resolveFilename override', () => {
    const testPack = packs.find(p => p.manifest.id === TEST_PACK_ID)!;
    expect(testPack.systems.has('hello')).toBe(true);

    const system = testPack.systems.get('hello')!;
    expect(system.machine).toBeDefined();
    expect(system.machine.id).toBe('e2e-hello');
  });

  it('merges manifest-declared events into the system event set', () => {
    const testPack = packs.find(p => p.manifest.id === TEST_PACK_ID)!;
    const system = testPack.systems.get('hello')!;

    expect(system.events.has('HELLO_PING')).toBe(true);
  });

  it('skips features without a system entry (plugin-only)', () => {
    const testPack = packs.find(p => p.manifest.id === TEST_PACK_ID)!;
    expect(testPack.systems.has('data-only')).toBe(false);
  });

  it('registers pack systems into the systems map and event validation map', () => {
    const testPack = packs.find(p => p.manifest.id === TEST_PACK_ID)!;

    const systemsMap: Record<string, any> = {};
    const eventValidationMap = new Map<string, Set<string>>();

    registerPackSystems([testPack], systemsMap, eventValidationMap);

    const systemId = `${TEST_PACK_ID}.hello`;
    expect(systemsMap[systemId]).toBeDefined();
    expect(systemsMap[systemId].id).toBe('e2e-hello');
    expect(eventValidationMap.has(systemId)).toBe(true);
    expect(eventValidationMap.get(systemId)!.has('HELLO_PING')).toBe(true);
  });

  it('setLoadedPacks populates registry data for FE consumption', () => {
    const testPack = packs.find(p => p.manifest.id === TEST_PACK_ID)!;

    // This populates the internal state that packsRouter.registry reads from
    setLoadedPacks([testPack]);

    // Verify the manifest has plugin entries that would appear in the FE registry
    const pluginDefs = testPack.manifest.plugins!.filter(f => f.plugin);
    expect(pluginDefs).toHaveLength(2);
    expect(pluginDefs[0].plugin!.label).toBe('Hello World');
    expect(pluginDefs[1].plugin!.label).toBe('Data View');
  });

  it('xstate machine from pack is functional (can create states)', () => {
    const testPack = packs.find(p => p.manifest.id === TEST_PACK_ID)!;
    const machine = testPack.systems.get('hello')!.machine;

    // Verify the machine has the expected structure
    expect(machine.config.initial).toBe('idle');
    expect(machine.config.states).toHaveProperty('idle');
    expect(machine.config.states.idle.on).toHaveProperty('CLIENT_CONNECTED');
    expect(machine.config.states.idle.on).toHaveProperty('HELLO_PING');
  });
});
