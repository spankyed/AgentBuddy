import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createActor, setup, type AnyEventObject } from 'xstate';
import { HOST } from '../../../../src/refs.ts';
import { _appDirOf, resolveAppContext } from '@abuddy/sdk/env';
import { resetTestData, takeSystemErrors, testRootEvents } from '@abuddy/sdk/testing';
import { readInstalledPacks } from '../../../../src/packs/installed.ts';
import { registry } from '../../../packs/runtime/test-host.ts';
import { appState } from '../../../../src/app-state/index.ts';
import { installPackFromLocal } from '../../../../src/packs/installer.ts';
import { createPacksSystem, type PackInfo } from '../../../../src/features/packs/be/system.ts';
import { activatePack } from '../../../../src/packs/runtime/lifecycle.ts';
import { loadAppPacks } from '../../../../src/packs/runtime/loader.ts';
import { reloadPackById } from '../../../../src/packs/runtime/reload.ts';
import { PACK_SNAPSHOT_FORMAT } from '@abuddy/sdk/build';
import { createPackArchive, stagePack } from '../../../../src/packs/layout.ts';
import { PACK_LAYOUT } from '../../../../src/packs/layout.ts';

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
  registry.clearLoadProblem(PACK_ID);
  if (origEnv.env === undefined) delete process.env.ABUDDY_ENV;
  else process.env.ABUDDY_ENV = origEnv.env;
  if (origEnv.userDataDir === undefined) delete process.env.ABUDDY_USER_DATA_DIR;
  else process.env.ABUDDY_USER_DATA_DIR = origEnv.userDataDir;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** The pack source `abuddy build` would leave, at `version`; `seeds` gives it compiled data that won't seed */
function packSource(version: string, { failsImport = false, id = PACK_ID } = {}): string {
  const dir = path.join(tmpDir, 'source');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'dist', 'runtime'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'dist', 'types'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'abuddy.json'), JSON.stringify({ id, name: 'Reinstall Pack', version }));
  fs.writeFileSync(path.join(dir, 'dist', 'runtime', 'index.cjs'), `module.exports = { registration: { id: ${JSON.stringify(id)} } };`);
  fs.writeFileSync(path.join(dir, 'dist', PACK_LAYOUT.snapshot), JSON.stringify({ format: PACK_SNAPSHOT_FORMAT }));
  if (failsImport) {
    // Compiled data with no seeds.json: the seeder can't tell whose records these are, so seeding fails
    fs.mkdirSync(path.join(dir, 'dist', 'runtime', 'seeds'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'dist', 'runtime', 'seeds', 'flows.seed.json'), '[]');
  }
  return dir;
}

/** A GitHub release of `source`, served to `fetch` from memory, with its published checksum */
async function stubRelease(source: string) {
  const stage = path.join(tmpDir, 'stage');
  fs.rmSync(stage, { recursive: true, force: true });
  stagePack(source, stage);
  const { file, sha256 } = await createPackArchive(stage, path.join(tmpDir, 'release'));
  const name = path.basename(file);
  const assets = [
    { name, browser_download_url: `https://example.test/${name}` },
    { name: `${name}.sha256`, browser_download_url: `https://example.test/${name}.sha256` },
  ];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('https://api.github.com/')) return new Response(JSON.stringify({ assets }), { status: 200 });
    if (url.endsWith('.sha256')) return new Response(`${sha256}  ${name}\n`, { status: 200 });
    return new Response(fs.readFileSync(file), { status: 200 });
  }));
}

/** The packs system running next to a bus that records what it is sent, and what it sends its plugin. */
function runPacksSystem() {
  const sent: AnyEventObject[] = [];
  const busStub = setup({ types: {} as { events: AnyEventObject } }).createMachine({
    on: { '*': { actions: ({ event }) => void sent.push(event) } },
  });
  const stopListening = testRootEvents.onPluginSend((message) => void sent.push({ type: 'OUTGOING', message }));
  const root = setup({ actors: { bus: busStub, packs: createPacksSystem(registry) } }).createMachine({
    invoke: [
      { src: 'bus', systemId: HOST.bus },
      { src: 'packs', systemId: HOST.packs },
    ],
  });
  const actor = createActor(root).start();
  const stop = () => {
    actor.stop();
    stopListening();
  };
  return { sent, send: (event: AnyEventObject) => actor.system.get(HOST.packs).send(event), stop };
}

/** The pack-scoped events the system emitted, unwrapped from the bus envelope */
const emitted = (sent: AnyEventObject[]) => sent.flatMap(e => {
  const inner = (e as { message?: { event: AnyEventObject } }).message?.event;
  return inner ? [inner] : [];
});

describe('installing over a pack that is already running', () => {
  it('tears the running copy down first, so the reinstall activates instead of colliding', async () => {
    const system = runPacksSystem();
    try {
      const { installPackFromLocal } = await import('../../../../src/packs/installer.ts');
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

// The host and the built-in packs come with the app: no uninstall removes them, and no installed pack takes their id
describe('a pack that ships with the app', () => {
  const shipped = { id: PACK_ID, name: 'Shipped', version: '1.0.0', dir: 'host-packs/shipped', builtIn: true };

  it.each([['a built-in pack', PACK_ID], ['the host', 'host']])("can't be uninstalled: %s", async (_what, packId) => {
    registry.registerPack({ id: PACK_ID }, shipped);
    const system = runPacksSystem();
    try {
      system.send({ type: 'UNINSTALL_PACK', packId });

      await vi.waitFor(() => expect(emitted(system.sent).map(e => e.type)).toContain('PACK_UNINSTALL_FAILED'));
      expect(emitted(system.sent).find(e => e.type === 'PACK_UNINSTALL_FAILED')).toMatchObject({ error: `"${packId}" is part of AgentBuddy, so it can't be uninstalled` });
      expect(emitted(system.sent).map(e => e.type)).not.toContain('PACK_DEACTIVATED');
      expect(registry.packOrigin(PACK_ID)).toEqual(shipped);
    } finally {
      system.stop();
    }
  });

  it("can't have its id taken by an installed pack, which is refused before the built-in stops", async () => {
    registry.registerPack({ id: PACK_ID }, shipped);
    const system = runPacksSystem();
    try {
      system.send({ type: 'INSTALL_PACK', packSlug: packSource('2.0.0'), source: 'local' });

      await vi.waitFor(() => expect(emitted(system.sent).map(e => e.type)).toContain('PACK_INSTALL_FAILED'));
      expect(emitted(system.sent).find(e => e.type === 'PACK_INSTALL_FAILED')).toMatchObject({ error: expect.stringContaining(`"${PACK_ID}" is a pack AgentBuddy ships`) });
      expect(registry.packOrigin(PACK_ID)).toEqual(shipped);
      expect(fs.existsSync(path.join(_appDirOf(tmpDir), 'packs', PACK_ID))).toBe(false);
    } finally {
      system.stop();
    }
  });
});

// The system whose whole job is listing packs once did not re-send it, so an open Packs view stayed stale
// after an `abuddy run` reload. It publishes on the one ask now, whatever caused it — the bus sends that
// after a pack changes, a client connects or the data is replaced (`tests/bus/send-state.spec.ts`).
describe('the packs system asked to publish', () => {
  it('sends the list again', () => {
    const system = runPacksSystem();
    try {
      system.send({ type: 'SEND_STATE' });

      expect(emitted(system.sent).map(e => e.type)).toEqual(['PACKS_LIST']);
    } finally {
      system.stop();
    }
  });
});

// The packs directory is what makes a pack installed. `abuddy install` and `abuddy run` write it and
// never installed-packs.json, so a pack with no row is the ordinary case, not a broken one.
describe('a pack with nothing recorded about it', () => {
  it('is listed, enabled', async () => {
    const system = runPacksSystem();
    try {
      const { installPackFromLocal } = await import('../../../../src/packs/installer.ts');
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

// The app skips an installed pack it can't load and boots on. The pack is still installed and enabled, so the Packs
// view lists it, and has to say why it isn't running rather than show it as enabled.
describe('an installed pack the app could not load', () => {
  const listed = (system: ReturnType<typeof runPacksSystem>) => {
    system.sent.length = 0;
    system.send({ type: 'GET_INSTALLED_PACKS' });
    const list = emitted(system.sent).find(e => e.type === 'PACKS_LIST');
    // Named rather than dereferenced through `?.`: no PACKS_LIST is the regression this helper exists to
    // catch, and a truncated chain reports it as a TypeError on the next line instead of by name
    expect(list, 'the system emitted no PACKS_LIST').toBeDefined();
    return (list!.packs as PackInfo[]).find(p => p.id === PACK_ID);
  };
  const snapshotFile = () => path.join(resolveAppContext().packsDir, PACK_ID, PACK_LAYOUT.snapshot);

  it('is listed with why, until a load of it succeeds', async () => {
    await installPackFromLocal(packSource('1.0.0'));
    // A build another abuddy made: what an app update leaves an installed pack as
    fs.writeFileSync(snapshotFile(), JSON.stringify({ format: PACK_SNAPSHOT_FORMAT + 1 }));
    await loadAppPacks(registry, {});
    expect(registry.getPackRegistration(PACK_ID)).toBeNull();

    const system = runPacksSystem();
    try {
      expect(listed(system)).toMatchObject({
        enabled: true,
        loadProblem: `its snapshot is format ${PACK_SNAPSHOT_FORMAT + 1}, written by a newer abuddy CLI; this AgentBuddy reads format ${PACK_SNAPSHOT_FORMAT}. Update AgentBuddy to use it`,
      });

      fs.writeFileSync(snapshotFile(), JSON.stringify({ format: PACK_SNAPSHOT_FORMAT }));
      await reloadPackById(registry, PACK_ID, { send: () => {} } as never);

      expect(registry.getPackRegistration(PACK_ID)).not.toBeNull();
      expect(listed(system)?.loadProblem).toBeUndefined();
    } finally {
      system.stop();
    }
  });

  it('is listed with why its activation failed, and not once it is disabled', async () => {
    await installPackFromLocal(packSource('1.0.0'));
    fs.writeFileSync(snapshotFile(), JSON.stringify({}));
    expect(activatePack(registry, PACK_ID, { send: () => {} } as never)).toBe(false);

    const system = runPacksSystem();
    try {
      expect(listed(system)?.loadProblem).toMatch(/^its snapshot is format \(none\), written by an older abuddy CLI/);

      system.send({ type: 'TOGGLE_PACK_ENABLED', packId: PACK_ID });

      expect(listed(system)).toMatchObject({ enabled: false, loadProblem: undefined });
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
      const { installPackFromLocal } = await import('../../../../src/packs/installer.ts');
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
  it('leaves no row behind when it is uninstalled', async () => {
    const system = runPacksSystem();
    try {
      const { installPackFromLocal } = await import('../../../../src/packs/installer.ts');
      await installPackFromLocal(packSource('1.0.0'));
      const { recordInstalled } = await import('../../../../src/packs/installed.ts');
      recordInstalled(PACK_ID, 'acme/reinstall-pack');

      system.send({ type: 'UNINSTALL_PACK', packId: PACK_ID });

      await vi.waitFor(() => {
        expect(emitted(system.sent).map(e => e.type)).toContain('PACK_UNINSTALL_COMPLETE');
      });
      expect(readInstalledPacks()).toEqual([]);
    } finally {
      system.stop();
    }
  });

  // The pack is still in the packs directory, so it is still installed — there is no record to roll back,
  // because the record never claimed it was installed in the first place
  it('stays listed when the uninstall fails', async () => {
    const system = runPacksSystem();
    try {
      const { installPackFromLocal } = await import('../../../../src/packs/installer.ts');
      await installPackFromLocal(packSource('1.0.0'));
      // A read-only pack directory: the uninstall can't unlink what is inside it, so it throws with the
      // pack still there — which is the case this is about, an uninstall that did not happen
      fs.chmodSync(path.join(_appDirOf(tmpDir), 'packs', PACK_ID), 0o500);

      system.send({ type: 'UNINSTALL_PACK', packId: PACK_ID });

      await vi.waitFor(() => {
        expect(emitted(system.sent).map(e => e.type)).toContain('PACK_UNINSTALL_FAILED');
      });
      fs.chmodSync(path.join(_appDirOf(tmpDir), 'packs', PACK_ID), 0o700);
      system.send({ type: 'GET_INSTALLED_PACKS' });
      const list = emitted(system.sent).filter(e => e.type === 'PACKS_LIST').pop();
      expect(list?.packs).toContainEqual(expect.objectContaining({ id: PACK_ID }));
    } finally {
      fs.chmodSync(path.join(_appDirOf(tmpDir), 'packs', PACK_ID), 0o700);
      system.stop();
    }
  });

  it("drops what was recorded about packs boot doesn't find, so rows don't pile up", async () => {
    const { recordInstalled, forgetPacksExcept } = await import('../../../../src/packs/installed.ts');
    recordInstalled('gone-pack', 'acme/gone');
    recordInstalled('here-pack', 'acme/here');

    forgetPacksExcept(new Set(['here-pack']));

    expect(readInstalledPacks()).toMatchObject([{ id: 'here-pack' }]);
  });
});

describe('installing over a pack that is already running', () => {
  // The install replaces the pack's directory. A pack left running across that reads the new code on its
  // next lazy require, so the teardown has to happen while the files it was loaded from are still there.
  it('tears the running copy down before its files are replaced', async () => {
    const { installPackFromLocal } = await import('../../../../src/packs/installer.ts');
    await installPackFromLocal(packSource('1.0.0'));
    expect(activatePack(registry, PACK_ID, { send: () => {} } as never)).toBe(true);

    /** What the pack's manifest on disk said each time the callback ran */
    const versionsWhenCalled: string[] = [];
    await installPackFromLocal(packSource('2.0.0'), undefined, {
      beforePlace: () => {
        const installed = path.join(_appDirOf(tmpDir), 'packs', PACK_ID, 'abuddy.json');
        versionsWhenCalled.push(JSON.parse(fs.readFileSync(installed, 'utf-8')).version);
      },
    });

    expect(versionsWhenCalled, 'the old copy is still in place when the caller is told').toEqual(['1.0.0']);
  });

  it('refuses a second install of the same slug while one is in flight', async () => {
    const system = runPacksSystem();
    try {
      const warned: string[] = [];
      const realWarn = console.warn;
      console.warn = (...args: unknown[]) => void warned.push(args.map(String).join(' '));
      try {
        system.send({ type: 'INSTALL_PACK', packSlug: packSource('1.0.0'), source: 'local' });
        system.send({ type: 'INSTALL_PACK', packSlug: packSource('1.0.0'), source: 'local' });
      } finally {
        console.warn = realWarn;
      }

      await vi.waitFor(() => {
        expect(emitted(system.sent).map(e => e.type)).toContain('PACK_INSTALL_COMPLETE');
      });
      // One install started, not two
      expect(emitted(system.sent).filter(e => e.type === 'PACK_INSTALL_STARTED')).toHaveLength(1);
      expect(warned.join('\n')).toMatch(/Operation already in progress/);
    } finally {
      system.stop();
    }
  });
});

// What the app has done to a pack's data outlives the pack's directory, because the data does: an
// uninstall removes packs/<id> and nothing in the database. Running a reinstalled pack's migrations
// again over rows they have already moved is the failure this avoids.
describe('what a reinstall does not redo', () => {
  it('leaves the seed hash and migrated version an uninstall did not invalidate', async () => {
    resetTestData();
    appState.update({ externalSeedHashes: { [PACK_ID]: 'the-hash' }, packVersions: { [PACK_ID]: '1.0.0' } });
    await installPackFromLocal(packSource('1.0.0'));

    const system = runPacksSystem();
    try {
      system.send({ type: 'UNINSTALL_PACK', packId: PACK_ID });
      await vi.waitFor(() => {
        expect(emitted(system.sent).map(e => e.type)).toContain('PACK_UNINSTALL_COMPLETE');
      });

      expect(appState.get().externalSeedHashes[PACK_ID]).toBe('the-hash');
      expect(appState.get().packVersions[PACK_ID]).toBe('1.0.0');
    } finally {
      system.stop();
    }
  });
});

// Installing is the remedy a user reaches for when a pack's data didn't seed, so what it reports has to be about
// the pack they end up with. It wasn't: `recordInstalled` replaces the record, which dropped the `lastError` the
// earlier failure left — so reinstalling a pack whose data never seeded reported that it had installed cleanly,
// and took away the only sign that it hadn't.
//
// **What makes the report true changed on 2026-10-07, and this case did not.** A reinstall used to re-seed by
// accident, through the file times that were once in the seed hash: the seed failed again and wrote the error
// back. Seeds are keyed on content now, so the same pack installed again is the same bytes and nothing is
// re-imported — and what keeps this honest is `recordInstalled` preserving `lastError`, which belongs to the
// seed outcome (`recordSeedOutcomes`) and is not an install's to clear. `activationProblem` reads it, so the
// install still says the pack's data failed to seed, which is what the user needs to know.
describe('reinstalling a pack whose data did not seed', () => {
  const outcomes = (sent: AnyEventObject[]) =>
    emitted(sent).map(e => e.type).filter(t => t === 'PACK_INSTALL_COMPLETE' || t === 'PACK_INSTALL_FAILED');

  it('says so again, rather than reporting the reinstall as clean', async () => {
    const source = packSource('1.0.0', { failsImport: true });

    const first = runPacksSystem();
    try {
      first.send({ type: 'INSTALL_PACK', packSlug: source, source: 'local' });
      await vi.waitFor(() => expect(outcomes(first.sent)).toHaveLength(1));
      expect(outcomes(first.sent)).toEqual(['PACK_INSTALL_FAILED']);
      expect(readInstalledPacks().find(r => r.id === PACK_ID)?.lastError).toBeTruthy();
    } finally {
      first.stop();
    }

    // The same pack again, byte for byte: nothing about its data has changed, so nothing is seeded again
    const second = runPacksSystem();
    try {
      second.send({ type: 'INSTALL_PACK', packSlug: source, source: 'local' });
      await vi.waitFor(() => expect(outcomes(second.sent)).toHaveLength(1));

      expect(outcomes(second.sent)).toEqual(['PACK_INSTALL_FAILED']);
      expect(readInstalledPacks().find(r => r.id === PACK_ID)?.lastError,
        'the reinstall erased the earlier failure, which is the only sign the data never seeded').toBeTruthy();
    } finally {
      second.stop();
    }
  });
});

// The id an uninstall is given names the directory it deletes, recursively
describe('uninstalling by an id that is not an installed pack', () => {
  it.each([['..'], [''], ['a/../..'], ['not-installed']])('is refused before anything stops or is deleted: %j', async (packId) => {
    await installPackFromLocal(packSource('1.0.0'));
    const system = runPacksSystem();
    try {
      system.send({ type: 'UNINSTALL_PACK', packId });

      await vi.waitFor(() => expect(emitted(system.sent).map(e => e.type)).toContain('PACK_UNINSTALL_FAILED'));
      expect(emitted(system.sent).find(e => e.type === 'PACK_UNINSTALL_FAILED')).toMatchObject({ error: `"${packId}" is not an installed pack` });
      expect(emitted(system.sent).map(e => e.type)).not.toContain('PACK_DEACTIVATED');
      expect(fs.existsSync(path.join(_appDirOf(tmpDir), 'packs', PACK_ID, 'abuddy.json'))).toBe(true);
    } finally {
      system.stop();
    }
  });
});

// An update takes whatever the release holds, which its source decides and the app doesn't
describe('updating to a release that holds another pack', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    if (registry.getPackExtensions('shipped-pack')) registry.unregisterPack('shipped-pack');
  });

  async function updateTo(releaseId: string) {
    await installPackFromLocal(packSource('1.0.0'));
    const { recordInstalled } = await import('../../../../src/packs/installed.ts');
    recordInstalled(PACK_ID, 'acme/reinstall-pack');
    expect(activatePack(registry, PACK_ID, { send: () => {} } as never)).toBe(true);
    await stubRelease(packSource('2.0.0', { id: releaseId }));

    const system = runPacksSystem();
    try {
      system.send({ type: 'UPDATE_PACK', packId: PACK_ID });
      await vi.waitFor(() => expect(emitted(system.sent).map(e => e.type)).toContain('PACK_UPDATE_FAILED'));
      return emitted(system.sent);
    } finally {
      system.stop();
    }
  }

  const installedVersion = () => JSON.parse(fs.readFileSync(path.join(_appDirOf(tmpDir), 'packs', PACK_ID, 'abuddy.json'), 'utf-8')).version;

  it("is refused when that pack is one the app ships, and the installed copy runs again", async () => {
    registry.registerPack({ id: 'shipped-pack' }, { id: 'shipped-pack', name: 'Shipped', version: '1.0.0', dir: 'host-packs/shipped-pack', builtIn: true });

    const sent = await updateTo('shipped-pack');

    expect(sent.find(e => e.type === 'PACK_UPDATE_FAILED')).toMatchObject({ error: expect.stringContaining('"shipped-pack" is a pack AgentBuddy ships') });
    expect(fs.existsSync(path.join(_appDirOf(tmpDir), 'packs', 'shipped-pack'))).toBe(false);
    expect(installedVersion()).toBe('1.0.0');
    expect(sent.map(e => e.type)).toContain('PACK_ACTIVATED');
  });

  it('is refused when that pack is any other, and the installed copy runs again', async () => {
    const sent = await updateTo('other-pack');

    expect(sent.find(e => e.type === 'PACK_UPDATE_FAILED')).toMatchObject({ error: expect.stringContaining('holds the pack "other-pack", not "reinstall-pack"') });
    expect(fs.existsSync(path.join(_appDirOf(tmpDir), 'packs', 'other-pack'))).toBe(false);
    expect(installedVersion()).toBe('1.0.0');
    expect(sent.map(e => e.type)).toContain('PACK_ACTIVATED');
  });
});
