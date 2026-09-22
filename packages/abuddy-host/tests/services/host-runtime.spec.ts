// createHostRuntime assembles the app the SDK binds: the given bus and version, the engine, the registered packs,
// and the host's services over the store. A reset leaves the app as a fresh boot does.
import { secretRedaction } from '../../src/secrets/redaction.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createEarsEngine } from '@abuddy/ears';
import type { LmdbStore } from '@abuddy/ears/lmdb';
import { testRootEvents } from '@abuddy/sdk/testing';
import { createHostRuntime } from '../../src/services/index.ts';
import { inference } from '../../src/services/inference.ts';
import { secrets } from '../../src/services/secrets.ts';
import { filesystem } from '../../src/services/filesystem.ts';
import { createPackRegistry } from '../../src/packs/pack-registration.ts';
import { secretsStore } from '../../src/secrets/index.ts';
import { startPacks } from '../../src/packs/runtime/start.ts';

// What a reset does, in order; the host's migrations runners and external packs' seeding record themselves here
const order = vi.hoisted((): string[] => []);
const appMigrations = vi.hoisted(() => ({ succeed: true }));
vi.mock('../../src/migrations/index.ts', () => ({
  runAppMigrations: () => { order.push('migrations'); return appMigrations.succeed; },
  runPackMigrations: (packs: Array<{ manifest: { id: string } }>) => { order.push(`pack migrations (${packs.map((p) => p.manifest.id)})`); },
}));
vi.mock('../../src/packs/plugin-keys.ts', () => ({
  addressStoredPluginKeys: () => { order.push('plugin keys'); },
}));
vi.mock('../../src/packs/runtime/seed.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/packs/runtime/seed.ts')>(),
  orchestrateDeclarativeSeed: (_manifest: unknown, packId: string) => { order.push(`boot seed (${packId})`); },
  seedPackData: (packs: Array<{ manifest: { id: string } }>) => { order.push(`pack seeds (${packs.map((p) => p.manifest.id)})`); return []; },
}));

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-runtime-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const newEngine = () => createEarsEngine({ isEntityType: () => false });

/** An external pack the app loaded: where it came from, as the loader records it */
const externalOrigin = (id: string, name: string) => ({
  id, name, version: '1.0.0', dir: '/nowhere', builtIn: false,
  manifest: { id, name, version: '1.0.0' } as never,
});

describe('createHostRuntime', () => {
  it('holds the bus, version, engine, registered packs and host services', () => {
    // The services reach the store only when called
    const engine = newEngine();
    const packs = createPackRegistry();
    const runtime = createHostRuntime({ store: {} as LmdbStore, engine, transport: { rootEvents: testRootEvents }, appVersion: '1.2.3', packs });
    expect(Object.keys(runtime).sort()).toEqual(['appVersion', 'ears', 'packs', 'redaction', 'services', 'transport']);
    // What log redaction masks: the host's own check over the values its secrets store has handled
    expect(runtime.redaction).toBe(secretRedaction);
    expect(runtime.transport.rootEvents).toBe(testRootEvents);
    expect(runtime.appVersion).toBe('1.2.3');
    expect(runtime.ears).toBe(engine.query);
    expect(runtime.packs).toBe(packs);
    expect(Object.keys(runtime.services).sort()).toEqual(['appData', 'filesystem', 'inference', 'secrets', 'traceStore']);
    expect(runtime.services.inference).toBe(inference);
    expect(runtime.services.secrets).toBe(secrets);
    expect(runtime.services.filesystem).toBe(filesystem);

    const service = { ping: () => 'pong' };
    packs.registerPack({ id: 'runtime-pack', features: { memos: { system: { machine: {} as never, receives: [] } } }, services: { memoService: service } });
    try {
      expect(runtime.packs.getRegisteredServices().memoService).toBe(service);
      expect(runtime.packs.systemIds()).toContain('runtime-pack/memos');
    } finally {
      packs.unregisterPack('runtime-pack');
    }
  });

  it("stops the packs, empties the engine, stores and keys, then starts the packs as a boot does", async () => {
    const store = { reset: async () => { order.push('store reset'); } } as unknown as LmdbStore;
    const engine = newEngine();
    const id = engine.query.tx('Memo-1' as never).put('title', 'kept?').id();
    const clear = engine.admin.clear;
    engine.admin.clear = () => { order.push('engine cleared'); clear(); };
    const packs = createPackRegistry();
    const runtime = createHostRuntime({ store, engine, transport: { rootEvents: testRootEvents }, appVersion: '1.2.3', packs });
    secretsStore.add('openai', 'Work', 'sk-proj-resetspec1234567890');
    // An external pack the app loaded, holding something open between its onInit and onShutdown
    const boot = { onInit: () => order.push(`onInit (${secretsStore.list().length} keys)`), onShutdown: () => order.push('onShutdown') };
    packs.registerPack({ id: 'reset-pack', boot }, externalOrigin('reset-pack', 'Reset'));
    // A built-in pack with a boot seed
    packs.registerPack({ id: 'seeded-pack', boot: { seedManifest: { seedKeys: ['notes'], compiledDir: '/nowhere' } } });
    packs.registerShutdownHook(boot.onShutdown, 'reset-pack');
    try {
      await runtime.services.appData.reset();
    } finally {
      packs.unregisterPack('reset-pack');
      packs.unregisterPack('seeded-pack');
    }
    expect(order).toEqual([
      'onShutdown', 'engine cleared', 'store reset', 'onInit (0 keys)',
      // Keys stored before 0.3.15 move before any migration reads them
      'plugin keys', 'migrations', 'pack migrations (reset-pack)', 'boot seed (seeded-pack)', 'pack seeds (reset-pack)',
    ]);
    expect(engine.query.getAttr(id, 'title')).toBeNull();
  });
});

describe('startPacks', () => {
  it("runs no pack migration or seed when the app's migrations failed", () => {
    order.length = 0;
    appMigrations.succeed = false;
    const packs = createPackRegistry();
    packs.registerPack({ id: 'late-seeded-pack', boot: { seedManifest: { seedKeys: ['notes'], compiledDir: '/nowhere' } } });
    packs.registerPack({ id: 'late-pack' }, externalOrigin('late-pack', 'Late'));
    try {
      startPacks(packs);
    } finally {
      appMigrations.succeed = true;
      packs.unregisterPack('late-seeded-pack');
      packs.unregisterPack('late-pack');
    }
    expect(order).toEqual(['plugin keys', 'migrations']);
  });
});
