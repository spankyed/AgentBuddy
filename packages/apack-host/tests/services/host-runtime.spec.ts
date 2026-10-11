// createHostRuntime assembles the app the SDK binds: the given bus and version, the engine, the registered packs,
// and the host's services over the store. A reset leaves the app as a fresh boot does.
import { secretRedaction } from '../../src/secrets/redaction.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createEarsEngine } from '@apack/ears';
import type { LmdbStore } from '@apack/ears/lmdb';
import { testRootEvents } from '@apack/sdk/testing';
import { createHostRuntime } from '../../src/services/index.ts';
import { inference } from '../../src/services/inference.ts';
import { secrets } from '../../src/services/secrets.ts';
import { filesystem } from '../../src/services/filesystem.ts';
import { createPackRegistry } from '../../src/packs/registry.ts';
import { secretsStore } from '../../src/secrets/index.ts';
import { startPacks } from '../../src/packs/runtime/start.ts';

// What a reset does, in order; the host's migrations runners and external packs' applying record themselves here
const order = vi.hoisted((): string[] => []);
const appMigrations = vi.hoisted(() => ({ succeed: true }));
vi.mock('../../src/migrations/index.ts', () => ({
  runAppMigrations: () => { order.push('migrations'); return appMigrations.succeed; },
  runPackMigrations: (packs: Array<{ manifest: { id: string } }>) => { order.push(`pack migrations (${packs.map((p) => p.manifest.id)})`); },
}));
vi.mock('../../src/packs/runtime/apply.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/packs/runtime/apply.ts')>(),
  // Sorted: which packs are in the one call is this file's claim, where their order among themselves is
  // `packContentOrder`'s and is held by the registry's own spec
  applyPacks: (packs: Array<{ manifest: { id: string } }>) => { order.push(`pack content (${packs.map((p) => p.manifest.id).sort()})`); return []; },
}));

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-runtime-'));
process.env.APACK_ENV = 'test';
process.env.APACK_USER_DATA_DIR = dataDir;
afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const newEngine = () => createEarsEngine({ isEntityType: () => false });

/** An external pack the app loaded: where it came from, as the loader records it */
const externalOrigin = (id: string, name: string) => ({
  id, name, version: '1.0.0', dir: '/nowhere', shipped: false,
  manifest: { id, name, version: '1.0.0' },
});

describe('createHostRuntime', () => {
  it('holds the bus, version, engine, registered packs and host services', () => {
    // The services reach the store only when called
    const engine = newEngine();
    const packs = createPackRegistry();
    const runtime = createHostRuntime({ store: {} as LmdbStore, engine, transport: { rootEvents: testRootEvents }, appVersion: '1.2.3', packs });
    // What log redaction masks: the host's own check over the values its secrets store has handled
    expect(runtime.redaction).toBe(secretRedaction);
    expect(runtime.transport.rootEvents).toBe(testRootEvents);
    expect(runtime.appVersion).toBe('1.2.3');
    expect(runtime.ears).toBe(engine.query);
    expect(runtime.packs).toBe(packs);
    expect(Object.keys(runtime.services).sort()).toEqual(['appData', 'filesystem', 'inference', 'secrets', 'settings', 'traceStore']);
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
    const id = engine.query.tx('Memo-1').put('title', 'kept?').id();
    const clear = engine.admin.clear;
    engine.admin.clear = () => { order.push('engine cleared'); clear(); };
    const packs = createPackRegistry();
    const runtime = createHostRuntime({ store, engine, transport: { rootEvents: testRootEvents }, appVersion: '1.2.3', packs });
    secretsStore.add('openai', 'Work', 'sk-proj-resetspec1234567890');
    // An external pack the app loaded, holding something open between its onInit and onShutdown
    const boot = { onInit: () => order.push(`onInit (${secretsStore.list().length} keys)`), onShutdown: () => order.push('onShutdown') };
    packs.registerPack({ id: 'reset-pack', boot }, externalOrigin('reset-pack', 'Reset'));
    // A pack the app ships, with a content policy — written by the same call as the installed one
    packs.registerPack({ id: 'written-pack' },
      { id: 'written-pack', name: 'Written', version: '1.0.0', dir: '/packs/written-pack', shipped: true } as never);
    packs.registerShutdownHook(boot.onShutdown, 'reset-pack');
    try {
      await runtime.services.appData.reset();
    } finally {
      packs.unregisterPack('reset-pack');
      packs.unregisterPack('written-pack');
    }
    // One content call for every pack, after the migrations — where it was the shipped pack's boot apply and
    // then the installed packs', which is why only the second half retried or saw a dependency content
    expect(order).toEqual([
      'onShutdown', 'engine cleared', 'store reset', 'onInit (0 keys)',
      'migrations', 'pack migrations (reset-pack)', 'pack content (reset-pack,written-pack)',
    ]);
    expect(engine.query.getAttr(id, 'title')).toBeNull();
  });
});

describe('startPacks', () => {
  it("runs no pack migration or apply when the app's migrations failed", () => {
    order.length = 0;
    appMigrations.succeed = false;
    const packs = createPackRegistry();
    packs.registerPack({ id: 'late-written-pack' });
    packs.registerPack({ id: 'late-pack' }, externalOrigin('late-pack', 'Late'));
    try {
      startPacks(packs);
    } finally {
      appMigrations.succeed = true;
      packs.unregisterPack('late-written-pack');
      packs.unregisterPack('late-pack');
    }
    expect(order).toEqual(['migrations']);
  });
});
