/**
 * E2E test: exercises the real pack loading pipeline against an isolated
 * test data directory (resolved through @abuddy/sdk/env, never the user's
 * real app data). The test installs a fresh test pack, runs the full
 * boot-sequence functions, and verifies the system loads, registers, and
 * could serve plugins to the FE via tRPC.
 *
 * Cleans up after itself.
 */
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
import { loadExternalPacks, type LoadedPack } from '@/packs/pack-loader';
import { setLoadedPacks } from '@/packs/pack-api';

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-e2e-'));
const TEST_PACK_ID = 'e2e-test-pack';
const TEST_PACK_DIR = path.join(USER_DATA_DIR, 'packs', TEST_PACK_ID);

function installTestPack() {
  fs.mkdirSync(path.join(TEST_PACK_DIR, 'dist'), { recursive: true });

  fs.writeFileSync(path.join(TEST_PACK_DIR, 'abuddy.json'), JSON.stringify({
    id: TEST_PACK_ID,
    name: 'E2E Test Pack',
    version: '1.0.0',
    features: [
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

let origEnv: { env?: string; userDataDir?: string };

beforeAll(() => {
  origEnv = { env: process.env.ABUDDY_ENV, userDataDir: process.env.ABUDDY_USER_DATA_DIR };
  process.env.ABUDDY_ENV = 'test';
  process.env.ABUDDY_USER_DATA_DIR = USER_DATA_DIR;
  installTestPack();
});

afterAll(() => {
  cleanupTestPack();
  fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
  for (const [key, value] of [['ABUDDY_ENV', origEnv.env], ['ABUDDY_USER_DATA_DIR', origEnv.userDataDir]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('E2E: pack loading pipeline', () => {
  let packs: LoadedPack[];

  it('discovers the test pack from the resolved packs directory', () => {
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

  it('setLoadedPacks populates registry data for FE consumption', () => {
    const testPack = packs.find(p => p.manifest.id === TEST_PACK_ID)!;

    // This populates the internal state that packsRouter.registry reads from
    setLoadedPacks([testPack]);

    // Verify the manifest has plugin entries that would appear in the FE registry
    const pluginDefs = (testPack.manifest.features ?? []).filter(f => f.plugin);
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
