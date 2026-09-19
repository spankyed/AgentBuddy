import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createActor, setup, type AnyEventObject } from 'xstate';
import { bus } from '@abuddy/sdk/ids';
import { registry } from './test-host.ts';
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

// Five of default-setup's systems re-send their data on PACK_CHANGED; the system whose whole job is
// listing packs did not, so an open Packs view stayed stale after an `abuddy dev` reload — the one way a
// pack changes without this system doing it.
describe('a pack changing underneath the packs system', () => {
  it('sends the list again', () => {
    const system = runPacksSystem();
    try {
      system.send({ type: 'PACK_CHANGED', packId: 'anything' });

      expect(emitted(system.sent).map(e => e.type)).toEqual(['PACKS_LIST']);
    } finally {
      system.stop();
    }
  });
});
