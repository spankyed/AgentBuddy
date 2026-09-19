import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createActor, setup, type AnyEventObject } from 'xstate';
import { bus } from '@abuddy/sdk/ids';
import { resolveAppContext } from '@abuddy/sdk/env';
import { takeSystemErrors } from '@abuddy/sdk/testing';
import { readInstalledPacks } from '../../../src/packs/installed-packs.ts';
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

// The packs directory is what makes a pack installed. `abuddy install` and `abuddy dev` write it and
// never installed-packs.json, so a pack with no row is the ordinary case, not a broken one.
describe('a pack with nothing recorded about it', () => {
  it('is listed, enabled', async () => {
    const system = runPacksSystem();
    try {
      const { installPackFromLocal } = await import('../../../src/packs/pack-installer.ts');
      await installPackFromLocal(packSource('1.0.0'));
      expect(fs.existsSync(resolveAppContext({ env: 'test', userDataDir: tmpDir }).installedPacksFile)).toBe(false);

      system.send({ type: 'GET_INSTALLED_PACKS' });

      const list = emitted(system.sent).find(e => e.type === 'PACKS_LIST');
      expect(list?.packs).toContainEqual(
        expect.objectContaining({ id: PACK_ID, version: '1.0.0', enabled: true, builtIn: false }),
      );
    } finally {
      system.stop();
    }
  });
});

// A write that fails is only a log line by default, and the app then disagrees with the user until the
// next boot puts the pack back the way it was. The decision that was lost is what has to be said.
describe('a decision that could not be saved', () => {
  it('says which one, rather than letting the toggle look like it worked', async () => {
    const system = runPacksSystem();
    try {
      const { installPackFromLocal } = await import('../../../src/packs/pack-installer.ts');
      await installPackFromLocal(packSource('1.0.0'));
      expect(activatePack(registry, PACK_ID, { send: () => {} } as never)).toBe(true);
      takeSystemErrors();
      // A directory where the record goes: the rename onto it fails, whatever is written beside it
      fs.mkdirSync(resolveAppContext({ env: 'test', userDataDir: tmpDir }).installedPacksFile, { recursive: true });

      system.send({ type: 'TOGGLE_PACK_ENABLED', packId: PACK_ID });

      expect(takeSystemErrors().map(e => e.message).join('\n'))
        .toMatch(new RegExp(`Couldn't save that ${PACK_ID} is disabled`));
    } finally {
      system.stop();
    }
  });
});

describe('a pack that is gone', () => {
  const recordFile = () => resolveAppContext({ env: 'test', userDataDir: tmpDir }).installedPacksFile;

  it('leaves no row behind when it is uninstalled', async () => {
    const system = runPacksSystem();
    try {
      const { installPackFromLocal } = await import('../../../src/packs/pack-installer.ts');
      await installPackFromLocal(packSource('1.0.0'));
      const { recordInstalled } = await import('../../../src/packs/installed-packs.ts');
      recordInstalled(PACK_ID, 'acme/reinstall-pack');

      system.send({ type: 'UNINSTALL_PACK', packId: PACK_ID });

      await vi.waitFor(() => {
        expect(emitted(system.sent).map(e => e.type)).toContain('PACK_UNINSTALL_COMPLETE');
      });
      expect(readInstalledPacks()).toMatchObject({ found: true, packs: [] });
    } finally {
      system.stop();
    }
  });

  // The pack is still in the packs directory, so it is still installed — there is no record to roll back,
  // because the record never claimed it was installed in the first place
  it('stays listed when the uninstall fails', async () => {
    const system = runPacksSystem();
    try {
      const { installPackFromLocal } = await import('../../../src/packs/pack-installer.ts');
      await installPackFromLocal(packSource('1.0.0'));
      // A read-only pack directory: the uninstall can't unlink what is inside it, so it throws with the
      // pack still there — which is the case this is about, an uninstall that did not happen
      fs.chmodSync(path.join(tmpDir, 'packs', PACK_ID), 0o500);

      system.send({ type: 'UNINSTALL_PACK', packId: PACK_ID });

      await vi.waitFor(() => {
        expect(emitted(system.sent).map(e => e.type)).toContain('PACK_UNINSTALL_FAILED');
      });
      fs.chmodSync(path.join(tmpDir, 'packs', PACK_ID), 0o700);
      system.send({ type: 'GET_INSTALLED_PACKS' });
      const list = emitted(system.sent).filter(e => e.type === 'PACKS_LIST').pop();
      expect(list?.packs).toContainEqual(expect.objectContaining({ id: PACK_ID }));
    } finally {
      fs.chmodSync(path.join(tmpDir, 'packs', PACK_ID), 0o700);
      system.stop();
    }
  });

  it("drops what was recorded about packs boot doesn't find, so rows don't pile up", async () => {
    const { recordInstalled, forgetPacksExcept } = await import('../../../src/packs/installed-packs.ts');
    recordInstalled('gone-pack', 'acme/gone');
    recordInstalled('here-pack', 'acme/here');

    forgetPacksExcept(new Set(['here-pack']));

    expect(readInstalledPacks()).toMatchObject({ found: true, packs: [{ id: 'here-pack' }] });
  });
});
