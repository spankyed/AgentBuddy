import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createActor, setup, type AnyEventObject } from 'xstate';
import { bus } from '@abuddy/sdk/ids';
import { resolveAppContext } from '@abuddy/sdk/env';
import { registry } from './test-host.ts';
import { readInstalledPacks } from '../../../src/packs/installed-packs.ts';
import { createPacksSystem, packs } from '../../../src/packs/runtime/packs-system.ts';
import { activatePack } from '../../../src/packs/runtime/lifecycle.ts';
import { removeLoadedPack } from '../../../src/packs/runtime/loaded-packs.ts';

const PACK_ID = 'reinstall-pack';

let tmpDir: string;
let origEnv: { env?: string; userDataDir?: string };

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'packs-system-'));
  origEnv = { env: process.env.ABUDDY_ENV, userDataDir: process.env.ABUDDY_USER_DATA_DIR };
  process.env.ABUDDY_ENV = 'test';
  process.env.ABUDDY_USER_DATA_DIR = tmpDir;
});

afterEach(() => {
  if (registry.getPackExtensions(PACK_ID)) registry.unregisterPack(PACK_ID);
  removeLoadedPack(PACK_ID);
  if (origEnv.env === undefined) delete process.env.ABUDDY_ENV;
  else process.env.ABUDDY_ENV = origEnv.env;
  if (origEnv.userDataDir === undefined) delete process.env.ABUDDY_USER_DATA_DIR;
  else process.env.ABUDDY_USER_DATA_DIR = origEnv.userDataDir;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** The pack source `abuddy build` would leave, at `version` */
function packSource(version: string): string {
  const dir = path.join(tmpDir, 'source');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'dist', 'runtime'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'dist', 'types'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'abuddy.json'), JSON.stringify({ id: PACK_ID, name: 'Reinstall Pack', version }));
  fs.writeFileSync(path.join(dir, 'dist', 'runtime', 'index.cjs'), `module.exports = { registration: { id: ${JSON.stringify(PACK_ID)}, systems: [] } };`);
  fs.writeFileSync(path.join(dir, 'dist', 'types', 'snapshot.json'), '{}');
  return dir;
}

/** The packs system running next to a bus that records what it is sent. */
function runPacksSystem() {
  const sent: AnyEventObject[] = [];
  const busStub = setup({ types: {} as { events: AnyEventObject } }).createMachine({
    on: { '*': { actions: ({ event }) => void sent.push(event) } },
  });
  const root = setup({ actors: { bus: busStub, packs: createPacksSystem(registry) } }).createMachine({
    invoke: [
      { src: 'bus', systemId: bus },
      { src: 'packs', systemId: packs },
    ],
  });
  const actor = createActor(root).start();
  return { sent, send: (event: AnyEventObject) => actor.system.get(packs).send(event), stop: () => actor.stop() };
}

/** The pack-scoped events the system emitted, unwrapped from the bus envelope */
const emitted = (sent: AnyEventObject[]) => sent.flatMap(e => {
  const inner = (e as { event?: AnyEventObject }).event;
  return inner ? [inner] : [];
});

describe('installing over a pack that is already running', () => {
  it('tears the running copy down first, so the reinstall activates instead of colliding', async () => {
    const system = runPacksSystem();
    try {
      const { installPackFromLocal } = await import('../../../src/packs/pack-installer.ts');
      await installPackFromLocal(packSource('1.0.0'));
      expect(activatePack(registry, PACK_ID, { send: () => {} } as never)).toBe(true);

      system.send({ type: 'INSTALL_PACK', packSlug: packSource('2.0.0'), source: 'local' });

      await vi.waitFor(() => {
        const types = emitted(system.sent).map(e => e.type);
        expect(types, JSON.stringify(emitted(system.sent))).toContain('PACK_INSTALL_COMPLETE');
      });
      expect(emitted(system.sent).map(e => e.type)).not.toContain('PACK_INSTALL_FAILED');
      // Registered once, by the copy that was just installed
      expect(registry.getPackExtensions(PACK_ID)).not.toBeNull();
      expect(emitted(system.sent).find(e => e.type === 'PACK_INSTALL_COMPLETE')).toMatchObject({ version: '2.0.0' });
    } finally {
      system.stop();
    }
  });
});

// installed-packs.json is written after an install and rebuilt at boot, but a failed write is logged and
// nothing more — so the app can be running a pack the record does not mention. An `abuddy install` done
// outside the app leaves the same state, which is what these set up.
describe('a pack the app is running that the record has lost', () => {
  async function runningButUnrecorded() {
    const { installPackFromLocal } = await import('../../../src/packs/pack-installer.ts');
    await installPackFromLocal(packSource('1.0.0'));
    expect(activatePack(registry, PACK_ID, { send: () => {} } as never)).toBe(true);
    // The record going missing under a running pack: the write that failed, or the file removed by hand
    fs.rmSync(resolveAppContext({ env: 'test', userDataDir: tmpDir }).installedPacksFile, { force: true });
    expect(readInstalledPacks().found).toBe(false);
  }

  it('is in the list, rather than the user being shown nothing where a running pack is', async () => {
    const system = runPacksSystem();
    try {
      await runningButUnrecorded();

      system.send({ type: 'GET_INSTALLED_PACKS' });

      const list = emitted(system.sent).find(e => e.type === 'PACKS_LIST');
      expect(list?.packs).toContainEqual(
        expect.objectContaining({ id: PACK_ID, version: '1.0.0', enabled: true, builtIn: false }),
      );
    } finally {
      system.stop();
    }
  });

  it('is written to the record when the user disables it, so the choice survives the next boot', async () => {
    const system = runPacksSystem();
    try {
      await runningButUnrecorded();

      system.send({ type: 'TOGGLE_PACK_ENABLED', packId: PACK_ID });

      expect(readInstalledPacks()).toMatchObject({
        found: true,
        packs: [expect.objectContaining({ id: PACK_ID, enabled: false })],
      });
      expect(emitted(system.sent).map(e => e.type)).toContain('PACK_DEACTIVATED');
    } finally {
      system.stop();
    }
  });
});
