/**
 * E2E test: exercises the real pack loading pipeline against an isolated
 * test data directory (resolved through @abuddy/sdk/env, never the user's
 * real app data). The test installs a fresh test pack, runs the full
 * boot-sequence functions, and verifies the system loads, registers, and
 * could serve plugins to the FE (the packs.registry entries).
 *
 * Cleans up after itself.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import './test-host.ts';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadExternalPacks } from '../../../src/packs/runtime/loader.ts';
import { setLoadedPacks, getPacksWithClientLoadedFrontends, type LoadedPack } from '../../../src/packs/runtime/loaded-packs.ts';

const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-e2e-'));
const TEST_PACK_ID = 'e2e-test-pack';
const TEST_PACK_DIR = path.join(USER_DATA_DIR, 'packs', TEST_PACK_ID);

function installTestPack() {
  fs.mkdirSync(path.join(TEST_PACK_DIR, 'runtime'), { recursive: true });

  fs.writeFileSync(path.join(TEST_PACK_DIR, 'abuddy.json'), JSON.stringify({
    id: TEST_PACK_ID,
    name: 'E2E Test Pack',
    version: '1.0.0',
    features: [
      {
        id: 'hello',
        system: {
          entry: 'src/features/hello/be/system.ts',
          events: { incoming: ['HELLO_PING'] },
        },
        plugin: { entry: 'src/features/hello/fe/plugin.ts' },
      },
      {
        id: 'dataOnly',
        // No system — plugin only
        plugin: { entry: 'src/features/dataOnly/fe/plugin.ts' },
      },
    ],
  }, null, 2));

  fs.writeFileSync(path.join(TEST_PACK_DIR, 'bundle.json'), JSON.stringify({
    formatVersion: 1, id: TEST_PACK_ID, version: '1.0.0', files: {},
  }));

  // The pack's frontend, which the renderer loads from the bundle
  fs.writeFileSync(path.join(TEST_PACK_DIR, 'runtime', 'fe.js'), 'export default { plugins: [] };');

  // A real runtime registration whose system machine requires xstate from the host
  fs.writeFileSync(path.join(TEST_PACK_DIR, 'runtime', 'index.cjs'), `
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

    module.exports = {
      registration: {
        id: '${TEST_PACK_ID}',
        systems: [{ id: 'hello', machine: helloMachine, events: new Set(['CLIENT_CONNECTED']) }],
        features: [{ id: 'hello', hasSystem: true, hasPlugin: true, services: [] }, { id: 'dataOnly', hasSystem: false, hasPlugin: true, services: [] }],
      },
    };
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

  it('loads the runtime registration via Module._resolveFilename override', () => {
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

  it('registers no system for a feature that has only a plugin', () => {
    const testPack = packs.find(p => p.manifest.id === TEST_PACK_ID)!;
    expect(testPack.systems.has('dataOnly')).toBe(false);
  });

  it('setLoadedPacks lists the pack as one whose frontend a client loads', () => {
    const testPack = packs.find(p => p.manifest.id === TEST_PACK_ID)!;

    // This populates the internal state that packsRouter.registry reads from
    setLoadedPacks([testPack]);

    expect(getPacksWithClientLoadedFrontends()).toEqual([TEST_PACK_ID]);
  });

  it('xstate machine from pack is functional (can create states)', () => {
    const testPack = packs.find(p => p.manifest.id === TEST_PACK_ID)!;
    const machine = testPack.systems.get('hello')!.machine;

    // Verify the machine has the expected structure
    expect(machine.config.initial).toBe('idle');
    expect(machine.config.states).toHaveProperty('idle');
    expect(machine.config.states!.idle.on).toHaveProperty('CLIENT_CONNECTED');
    expect(machine.config.states!.idle.on).toHaveProperty('HELLO_PING');
  });
});
