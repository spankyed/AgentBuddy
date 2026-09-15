// Reloading a pack loads and registers its rebuilt runtime before the running one shuts down: a rebuild that
// fails to load, or whose registration is refused, leaves the running pack as it was.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { registerHostModule } from '@abuddy/sdk/runtime';

vi.mock('virtual:built-in-pack-loaders', () => ({ default: {} }));
vi.mock('@/core/ears/attribute-storage', () => ({ invalidatePartitionPolicy: () => {} }));
vi.mock('@abuddy/host/settings', () => ({
  settingsRepository: {
    settingsQueries: { getInternalSettings: () => ({ packSeedHashes: {} }) },
    settingsCommands: { updateSettings: () => {} },
  },
}));

const noop = () => {};
registerHostModule('logger', { createLogger: () => ({ debug: noop, info: noop, warn: noop, error: noop }), LogEvent: {} });

const { registerPack, unregisterPack, getPackRegistration } = await import('@abuddy/host/packs');
const { registerShutdownHook, removeShutdownHooksForKey } = await import('@abuddy/sdk/utils');
const { reloadExternalPack } = await import('@/packs/pack-reload');

const PACK_ID = 'reload-pack';

let tmpDir: string;
let origEnv: { env?: string; userDataDir?: string };
const running = { id: PACK_ID, systems: [{ id: `${PACK_ID}.widget`, machine: { id: 'widget', config: {} } as never, events: new Set(['PING']) }] };
const bus = { send: vi.fn() };
const shutdown = vi.fn();

/** Writes the rebuilt pack: a bundle whose runtime entry is `runtimeSource` */
function writeRebuild(runtimeSource: string) {
  const packDir = path.join(tmpDir, 'packs', PACK_ID);
  fs.mkdirSync(path.join(packDir, 'runtime', 'seeds'), { recursive: true });
  fs.mkdirSync(path.join(packDir, 'types'), { recursive: true });
  fs.writeFileSync(path.join(packDir, 'abuddy.json'), JSON.stringify({ id: PACK_ID, name: PACK_ID, version: '1.0.1' }));
  fs.writeFileSync(path.join(packDir, 'bundle.json'), JSON.stringify({ formatVersion: 1, id: PACK_ID, version: '1.0.1', files: {} }));
  fs.writeFileSync(path.join(packDir, 'types', 'snapshot.json'), '{}');
  fs.writeFileSync(path.join(packDir, 'runtime', 'index.cjs'), runtimeSource);
}

const runtime = (services = '') => `
  module.exports = {
    registration: {
      id: '${PACK_ID}',
      systems: [{ id: 'widget', machine: { id: 'widget', config: {} }, events: new Set(['PING']) }],
      ${services}
    },
  };
`;

function expectRunningPackIntact() {
  expect(getPackRegistration(PACK_ID)?.systems).toBe(running.systems);
  expect(shutdown).not.toHaveBeenCalled();
  expect(bus.send).not.toHaveBeenCalled();
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-reload-'));
  origEnv = { env: process.env.ABUDDY_ENV, userDataDir: process.env.ABUDDY_USER_DATA_DIR };
  process.env.ABUDDY_ENV = 'test';
  process.env.ABUDDY_USER_DATA_DIR = tmpDir;
  bus.send.mockReset();
  shutdown.mockReset();
  registerPack(running);
  registerShutdownHook(shutdown, PACK_ID);
});

afterEach(() => {
  for (const id of [PACK_ID, 'service-owner']) {
    try { unregisterPack(id); } catch { /* not registered */ }
  }
  removeShutdownHooksForKey(PACK_ID);
  for (const [key, value] of [['ABUDDY_ENV', origEnv.env], ['ABUDDY_USER_DATA_DIR', origEnv.userDataDir]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('reloading a pack', () => {
  it('leaves the running pack intact when the rebuilt runtime throws while loading', async () => {
    writeRebuild(`throw new Error('broken build');`);
    await expect(reloadExternalPack(PACK_ID, bus as never)).rejects.toThrow(`Failed to load pack ${PACK_ID}`);
    expectRunningPackIntact();
  });

  it('leaves the running pack intact when the rebuilt runtime exports no registration', async () => {
    writeRebuild(`module.exports = {};`);
    await expect(reloadExternalPack(PACK_ID, bus as never)).rejects.toThrow(`Failed to load pack ${PACK_ID}`);
    expectRunningPackIntact();
  });

  it('restores the running registration when the rebuilt one is refused', async () => {
    registerPack({ id: 'service-owner', systems: [], services: { taken: {} } });
    writeRebuild(runtime(`services: { taken: {} },`));
    await expect(reloadExternalPack(PACK_ID, bus as never)).rejects.toThrow(`Failed to register pack ${PACK_ID}`);
    expectRunningPackIntact();
  });

  it('shuts the running pack down and restarts its systems once the rebuild is registered', async () => {
    writeRebuild(runtime());
    await reloadExternalPack(PACK_ID, bus as never);

    expect(getPackRegistration(PACK_ID)?.systems).not.toBe(running.systems);
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(bus.send).toHaveBeenCalledWith({ type: 'RELOAD_PACK', packId: PACK_ID, systemIds: [`${PACK_ID}.widget`] });
  });
});
