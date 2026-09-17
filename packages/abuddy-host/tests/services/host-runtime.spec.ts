// createHostRuntime assembles the app the SDK binds: the given bus and version, the engine, the registered packs,
// and the host's services over the store. A reset leaves the app as a fresh boot does.
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
import { createPackRegistry } from '../../src/packs/pack-registration.ts';
import { secretsStore } from '../../src/secrets/index.ts';

// What a reset does, in order; the host's migrations runner records itself here
const order = vi.hoisted((): string[] => []);
vi.mock('../../src/migrations/index.ts', () => ({ runAppMigrations: () => { order.push('migrations'); } }));

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-runtime-'));
process.env.ABUDDY_ENV = 'test';
process.env.ABUDDY_USER_DATA_DIR = dataDir;
afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const newEngine = () => createEarsEngine({ isEntityType: () => false });

describe('createHostRuntime', () => {
  it('holds the bus, version, engine, registered packs and host services', () => {
    // The services reach the store only when called
    const engine = newEngine();
    const packs = createPackRegistry();
    const runtime = createHostRuntime({ store: {} as LmdbStore, engine, transport: { rootEvents: testRootEvents }, appVersion: '1.2.3', packs });
    expect(Object.keys(runtime).sort()).toEqual(['appVersion', 'ears', 'packs', 'services', 'transport']);
    expect(runtime.transport.rootEvents).toBe(testRootEvents);
    expect(runtime.appVersion).toBe('1.2.3');
    expect(runtime.ears).toBe(engine.query);
    expect(runtime.packs).toBe(packs);
    expect(Object.keys(runtime.services).sort()).toEqual(['appData', 'inference', 'secrets', 'traceStore']);
    expect(runtime.services.inference).toBe(inference);
    expect(runtime.services.secrets).toBe(secrets);

    const service = { ping: () => 'pong' };
    packs.registerPack({ id: 'runtime-pack', systems: [{ id: 'runtime-pack.memos', machine: {} as never, events: new Set() }], services: { memoService: service } });
    try {
      expect(runtime.packs.getRegisteredServices().memoService).toBe(service);
      expect(runtime.packs.resolveSystemAddress('runtime-pack/memos')).toBe('runtime-pack.memos');
    } finally {
      packs.unregisterPack('runtime-pack');
    }
  });

  it("empties the engine, resets the stores and keys, then runs each pack's onInit, then the host's migrations", async () => {
    const store = { reset: async () => { order.push('store reset'); } } as unknown as LmdbStore;
    const engine = newEngine();
    const id = engine.query.tx('Memo-1' as never).put('title', 'kept?').id();
    const clear = engine.admin.clear;
    engine.admin.clear = () => { order.push('engine cleared'); clear(); };
    const packs = createPackRegistry();
    const runtime = createHostRuntime({ store, engine, transport: { rootEvents: testRootEvents }, appVersion: '1.2.3', packs });
    secretsStore.add('openai', 'Work', 'sk-proj-resetspec1234567890');
    packs.registerPack({ id: 'reset-pack', systems: [], boot: { onInit: () => order.push(`onInit (${secretsStore.list().length} keys)`) } });
    try {
      await runtime.services.appData.reset();
    } finally {
      packs.unregisterPack('reset-pack');
    }
    expect(order).toEqual(['engine cleared', 'store reset', 'onInit (0 keys)', 'migrations']);
    expect(engine.query.getAttr(id, 'title')).toBeNull();
  });
});
