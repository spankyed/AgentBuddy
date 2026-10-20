// The shell loads external packs' frontends from the loaded-packs list whenever this window's bus
// subscription is established: a query that fails leaves the packs unloaded until the next connection,
// which accepts fresh frontends before announcing them so their systems send startup data.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, type Actor } from 'xstate';
import type { Plugin } from '@apackdev/sdk/fe';
import { createShellMachine, type ShellMachine } from '../../../../src/fe/index.ts';
import { fakeShell, plugin, settle } from './fakes.ts';

let app: Actor<ShellMachine>;
let warn: ReturnType<typeof vi.spyOn>;
let fake: ReturnType<typeof fakeShell>['client'];
let packClientReady: typeof fake.packClientReady;
let loadedPacksQuery: typeof fake.loadedPacks;
let loadPackFrontend: ReturnType<typeof fakeShell>['packFrontends']['load'];
let unloadPackFrontend: ReturnType<typeof fakeShell>['packFrontends']['unload'];
let toastError: ReturnType<typeof fakeShell>['notify']['error'];

beforeEach(() => {
  const shell = fakeShell({ plugins: [plugin('notes')] });
  fake = shell.client;
  ({ packClientReady, loadedPacks: loadedPacksQuery } = fake);
  ({ load: loadPackFrontend, unload: unloadPackFrontend } = shell.packFrontends);
  toastError = shell.notify.error;
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  app = createActor(createShellMachine(shell.options), {
    systemId: 'host/application',
    input: { ownsLastActivePlugin: false },
  }).start();
});

afterEach(() => {
  app.stop();
  warn.mockRestore();
});

/** This window's subscription is established */
const connect = () => fake.connect();
const dropConnection = () => fake.dropConnection();

describe('loading pack frontends from the loaded packs', () => {
  it('loads the packs on a later connection when the first query fails', async () => {
    loadedPacksQuery.mockRejectedValueOnce(new Error('connection closed'));

    connect();
    await settle();

    expect(loadPackFrontend).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[shell] Failed to read the loaded packs:', 'connection closed');

    loadedPacksQuery.mockResolvedValue([{ id: 'ext', feEntry: 'runtime/fe.js' }]);
    loadPackFrontend.mockResolvedValue([plugin('ext/own')]);

    dropConnection();
    connect();
    await settle();

    expect(loadPackFrontend).toHaveBeenCalledTimes(1);
    expect(app.getSnapshot().context.plugins.map(p => p.id)).toContain('ext/own');
    expect(app.system.get('ext/own')).toBeDefined();
    expect(packClientReady).toHaveBeenCalledWith('ext', 'runtime');
  });

  // Every pack's frontend is loaded the same way, the one the app ships included: nothing here reads which
  // kind of pack it is. Each connection needs fresh accepted bindings.
  it("reaccepts every pack frontend on reconnect, whoever ships it", async () => {
    loadedPacksQuery.mockResolvedValue([
      { id: 'default-setup', feEntry: 'runtime/fe.js' },
      { id: 'ext', feEntry: 'runtime/fe.js' },
    ]);
    // A plugin's id is its feature's ref, so two packs cannot contribute the same one
    loadPackFrontend.mockImplementation((pack: { id: string }) => Promise.resolve([plugin(`${pack.id}/own`)]));

    connect();
    await settle();

    expect(loadPackFrontend.mock.calls.map(([pack]) => pack.id)).toEqual(['default-setup', 'ext']);

    dropConnection();
    connect();
    await settle();

    expect(loadPackFrontend).toHaveBeenCalledTimes(4);
    expect(unloadPackFrontend).not.toHaveBeenCalled();
    expect(app.getSnapshot().context.plugins.map(p => p.id))
      .toEqual(expect.arrayContaining(['default-setup/own', 'ext/own']));
  });

  it('loads a pack activated while a load is running, whose read predates it', async () => {
    let releaseFirstQuery: (packs: Array<{ id: string; feEntry?: string }>) => void = () => {};
    loadedPacksQuery.mockReturnValueOnce(new Promise<Array<{ id: string; feEntry?: string }>>(resolve => { releaseFirstQuery = resolve; }));

    connect();
    app.send({ type: 'LOAD_PACK_FRONTENDS' });

    loadedPacksQuery.mockResolvedValue([
      { id: 'ext', feEntry: 'runtime/fe.js' },
      { id: 'installed', feEntry: 'runtime/fe.js' },
    ]);
    loadPackFrontend.mockImplementation(async pack => [plugin(`${pack.id}-plugin`)]);

    releaseFirstQuery([{ id: 'ext', feEntry: 'runtime/fe.js' }]);
    await settle();

    expect(loadPackFrontend.mock.calls.map(([pack]) => pack.id)).toEqual(['ext', 'installed']);
    expect(app.getSnapshot().context.plugins.map(p => p.id)).toEqual(expect.arrayContaining(['ext-plugin', 'installed-plugin']));
  });

  it("drops the result of a load for a pack unloaded while it was running", async () => {
    loadedPacksQuery.mockResolvedValue([{ id: 'ext', feEntry: 'runtime/fe.js' }]);
    let releaseLoad: (plugins: Plugin[]) => void = () => {};
    loadPackFrontend.mockResolvedValue([plugin('ext/own')]);
    loadPackFrontend.mockReturnValueOnce(new Promise<Plugin[]>(resolve => { releaseLoad = resolve; }));

    connect();
    await settle();

    // The pack is uninstalled while its frontend is still loading
    app.send({ type: 'PACK_PLUGINS_UNLOADED', packId: 'ext' });
    releaseLoad([plugin('ext/own')]);
    await settle();

    const { plugins, acceptedPackRuntimes } = app.getSnapshot().context;
    expect(plugins.map(p => p.id)).toEqual(['notes']);
    expect(acceptedPackRuntimes).toEqual({});
    expect(app.system.get('ext/own')).toBeUndefined();
    expect(packClientReady).not.toHaveBeenCalled();
    // What the dropped load registered is undone
    expect(unloadPackFrontend).toHaveBeenCalledWith('ext');

    // Nothing lingers: the pack loads again when it's installed once more
    dropConnection();
    connect();
    await settle();
    expect(loadPackFrontend).toHaveBeenCalledTimes(2);
  });

  it('keeps loading the other packs when one throws, and reports that pack', async () => {
    loadedPacksQuery.mockResolvedValue([
      { id: 'bad', feEntry: 'runtime/fe.js' },
      { id: 'good', feEntry: 'runtime/fe.js' },
    ]);
    loadPackFrontend.mockImplementation(async (pack) => {
      if (pack.id === 'bad') throw new Error('styles blew up');
      return [plugin('good-plugin')];
    });

    connect();
    await settle();

    expect(app.getSnapshot().context.packsWithFrontend).toEqual(['good']);
    expect(app.system.get('good-plugin')).toBeDefined();
    expect(app.getSnapshot().context.acceptedPackRuntimes).toEqual({ 'good': 'runtime' });
    expect(packClientReady).not.toHaveBeenCalledWith('bad');
    // The failure names the pack, not the read, which succeeded
    expect(toastError).toHaveBeenCalledWith("Couldn't load bad", 'styles blew up');
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalledWith('[shell] Failed to read the loaded packs:', expect.anything());
  });

  it('retries a failed frontend on the next load request without announcing it ready', async () => {
    loadedPacksQuery.mockResolvedValue([{ id: 'ext', feEntry: 'runtime/fe.js' }]);
    loadPackFrontend.mockRejectedValueOnce(new Error('temporary import failure'));
    loadPackFrontend.mockResolvedValue([plugin('ext/own')]);
    connect();
    await settle();
    expect(app.getSnapshot().context.acceptedPackRuntimes).toEqual({});
    expect(packClientReady).not.toHaveBeenCalled();
    app.send({ type: 'LOAD_PACK_FRONTENDS' });
    await settle();
    expect(loadPackFrontend).toHaveBeenCalledTimes(2);
    expect(app.getSnapshot().context.acceptedPackRuntimes).toEqual({ 'ext': 'runtime' });
    expect(packClientReady).toHaveBeenCalledWith('ext', 'runtime');
  });

  it('tells the user about a failed read only while no read has succeeded', async () => {
    loadedPacksQuery.mockRejectedValueOnce(new Error('connection closed'));
    connect();
    await settle();
    expect(toastError).toHaveBeenCalledWith("Add-on packs couldn't be loaded", 'connection closed');

    loadedPacksQuery.mockResolvedValueOnce([]);
    dropConnection();
    connect();
    await settle();
    toastError.mockClear();

    // The API restarts: this read fails, and the next connection repairs it
    loadedPacksQuery.mockRejectedValueOnce(new Error('connection closed'));
    dropConnection();
    connect();
    await settle();

    expect(toastError).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[shell] Failed to read the loaded packs:', 'connection closed');
  });

  it("reaccepts styles-only packs without announcing frontend readiness", async () => {
    loadedPacksQuery.mockResolvedValue([{ id: 'styles-only', feStyles: 'runtime/fe.css' }]);
    loadPackFrontend.mockResolvedValue(null);

    connect();
    await settle();

    const { acceptedPackRuntimes, packsWithFrontend } = app.getSnapshot().context;
    expect(acceptedPackRuntimes).toEqual({ 'styles-only': 'runtime' });
    // It has no systems waiting on a frontend, so it's neither merged nor announced
    expect(packsWithFrontend).toEqual([]);
    expect(packClientReady).not.toHaveBeenCalled();

    dropConnection();
    connect();
    await settle();

    expect(loadPackFrontend).toHaveBeenCalledTimes(2);
    expect(unloadPackFrontend).not.toHaveBeenCalled();
  });
});


it('discards a late result from the lost connection before accepting a fresh registration', async () => {
  loadedPacksQuery.mockResolvedValue([{ id: 'ext', feEntry: 'runtime/fe.js' }]);
  let release!: (plugins: Plugin[]) => void;
  loadPackFrontend.mockReturnValueOnce(new Promise<Plugin[]>(resolve => { release = resolve; }));
  loadPackFrontend.mockResolvedValue([plugin('ext/new')]);
  connect();
  await settle();
  dropConnection();
  connect();
  await settle();
  expect(loadPackFrontend).toHaveBeenCalledTimes(2);
  expect(packClientReady.mock.calls).toEqual([['ext', 'runtime']]);
  release([plugin('ext/stale')]);
  await settle();
  expect(unloadPackFrontend).not.toHaveBeenCalled();
  expect(loadPackFrontend).toHaveBeenCalledTimes(2);
  expect(app.system.get('ext/stale')).toBeUndefined();
  expect(app.system.get('ext/new')).toBeDefined();
  expect(packClientReady.mock.calls).toEqual([['ext', 'runtime']]);

});

it('preserves the selected actor through disconnect and replaces it after fresh acceptance', async () => {
  loadedPacksQuery.mockResolvedValue([{ id: 'ext', feEntry: 'runtime/fe.js' }]);
  loadPackFrontend.mockResolvedValue([plugin('ext/own')]);
  connect();
  await settle();
  app.send({ type: 'SELECT_PLUGIN', plugin: 'ext/own' });
  const previous = app.system.get('ext/own');
  dropConnection();
  expect(app.system.get('ext/own')).toBe(previous);
  expect(app.getSnapshot().context.activePlugin.id).toBe('ext/own');
  expect(app.getSnapshot().context.pendingPluginId).toBeNull();
  connect();
  await settle();
  expect(app.getSnapshot().context.activePlugin.id).toBe('ext/own');
  expect(app.system.get('ext/own')).toBeDefined();
  expect(app.system.get('ext/own')).not.toBe(previous);
});

it('does not restart an interrupted loader while the connection remains down', async () => {
  loadedPacksQuery.mockResolvedValue([{ id: 'ext', feEntry: 'runtime/fe.js' }]);
  let release!: (plugins: Plugin[]) => void;
  loadPackFrontend.mockReturnValueOnce(new Promise<Plugin[]>(resolve => { release = resolve; }));
  connect();
  await settle();
  app.send({ type: 'LOAD_PACK_FRONTENDS' });
  dropConnection();
  release([plugin('ext/stale')]);
  await settle();
  app.send({ type: 'LOAD_PACK_FRONTENDS' });
  await settle();
  expect(loadPackFrontend).toHaveBeenCalledTimes(1);
  expect(app.system.get('ext/stale')).toBeUndefined();
  expect(app.getSnapshot().context.packLoadRunning).toBe(false);
  expect(packClientReady).not.toHaveBeenCalled();
});


it('keeps the accepted frontend and selection when a reconnect read fails', async () => {
  loadedPacksQuery.mockResolvedValueOnce([{ id: 'ext', feEntry: 'runtime/fe.js' }]);
  loadPackFrontend.mockResolvedValue([plugin('ext/own')]);
  connect();
  await settle();
  app.send({ type: 'SELECT_PLUGIN', plugin: 'ext/own' });
  const previous = app.system.get('ext/own');
  loadedPacksQuery.mockRejectedValueOnce(new Error('read refused'));
  dropConnection();
  connect();
  await settle();
  expect(app.system.get('ext/own')).toBe(previous);
  expect(app.getSnapshot().context.activePlugin.id).toBe('ext/own');
  expect(app.getSnapshot().context.acceptedPackRuntimes).toEqual({ 'ext': 'runtime' });
  expect(unloadPackFrontend).not.toHaveBeenCalled();
});

it('keeps accepted actors while preparing a replacement and after its refusal', async () => {
  loadedPacksQuery.mockResolvedValue([{ id: 'ext', feEntry: 'runtime/fe.js' }]);
  loadPackFrontend.mockResolvedValueOnce([plugin('ext/own')]);
  connect();
  await settle();
  app.send({ type: 'SELECT_PLUGIN', plugin: 'ext/own' });
  const previous = app.system.get('ext/own');
  let refuse!: (error: Error) => void;
  loadPackFrontend.mockReturnValueOnce(new Promise((_resolve, reject) => { refuse = reject; }));
  packClientReady.mockClear();
  dropConnection();
  connect();
  await settle();
  expect(app.system.get('ext/own')).toBe(previous);
  expect(packClientReady).not.toHaveBeenCalled();
  refuse(new Error('candidate refused'));
  await settle();
  expect(app.system.get('ext/own')).toBe(previous);
  expect(previous?.getSnapshot().status).toBe('active');
  expect(app.getSnapshot().context.activePlugin.id).toBe('ext/own');
  expect(unloadPackFrontend).not.toHaveBeenCalled();
  expect(toastError).toHaveBeenCalledWith("Couldn't load ext", 'candidate refused');
});

it('removes an absent owner only after an authoritative reconnect read', async () => {
  loadedPacksQuery.mockResolvedValueOnce([{ id: 'ext', feEntry: 'runtime/fe.js' }]);
  loadPackFrontend.mockResolvedValue([plugin('ext/own')]);
  connect();
  await settle();
  app.send({ type: 'SELECT_PLUGIN', plugin: 'ext/own' });
  const previous = app.system.get('ext/own');
  dropConnection();
  expect(previous?.getSnapshot().status).toBe('active');
  loadedPacksQuery.mockResolvedValueOnce([]);
  connect();
  await settle();
  expect(unloadPackFrontend.mock.calls).toEqual([['ext']]);
  expect(previous?.getSnapshot().status).toBe('stopped');
  expect(app.system.get('ext/own')).toBeUndefined();
  expect(app.getSnapshot().context.activePlugin.id).toBe('notes');
  expect(app.getSnapshot().context.acceptedPackRuntimes).toEqual({});
});

it('reconciles removed plugins when an accepted replacement has no frontend', async () => {
  loadedPacksQuery.mockResolvedValue([{ id: 'ext', feEntry: 'runtime/fe.js' }]);
  loadPackFrontend.mockResolvedValueOnce([plugin('ext/own'), plugin('ext/removed')]);
  connect();
  await settle();
  app.send({ type: 'SELECT_PLUGIN', plugin: 'ext/own' });
  const previous = app.system.get('ext/own');
  loadPackFrontend.mockResolvedValueOnce(null);
  packClientReady.mockClear();
  dropConnection();
  connect();
  await settle();
  expect(previous?.getSnapshot().status).toBe('stopped');
  expect(app.system.get('ext/removed')).toBeUndefined();
  expect(app.getSnapshot().context.plugins.map(plugin => plugin.id)).toEqual(['notes']);
  expect(app.getSnapshot().context.activePlugin.id).toBe('notes');
  expect(app.getSnapshot().context.packsWithFrontend).toEqual([]);
  expect(app.getSnapshot().context.acceptedPackRuntimes).toEqual({ 'ext': 'runtime' });
  expect(packClientReady).not.toHaveBeenCalled();
  expect(unloadPackFrontend).not.toHaveBeenCalled();
});


it('publishes new plugin definitions without duplicate actors or changing tab order and visibility', async () => {
  loadedPacksQuery.mockResolvedValue([{ id: 'ext', feEntry: 'runtime/fe.js' }, { id: 'other', feEntry: 'runtime/fe.js' }]);
  loadPackFrontend.mockImplementation(pack => Promise.resolve([plugin(`${pack.id}/own`)]));
  connect();
  await settle();
  app.send({ type: 'SELECT_PLUGIN', plugin: 'ext/own' });
  app.send({ type: 'PLUGIN_VISIBILITY_UPDATED', pluginVisibility: { 'ext/own': false } });
  const previous = app.system.get('ext/own');
  const order = app.getSnapshot().context.plugins.map(plugin => plugin.id);
  const replacement = { ...plugin('ext/own'), label: 'Updated' };
  loadPackFrontend.mockImplementation(pack => Promise.resolve(pack.id === 'ext' ? [replacement] : [plugin('other/own')]));
  dropConnection();
  connect();
  await settle();
  expect(previous?.getSnapshot().status).toBe('stopped');
  expect(app.system.get('ext/own')).not.toBe(previous);
  expect(app.getSnapshot().context.activePlugin).toBe(replacement);
  expect(app.getSnapshot().context.plugins.map(plugin => plugin.id)).toEqual(order);
  expect(app.getSnapshot().context.pluginVisibility).toEqual({ 'ext/own': false });
  expect(unloadPackFrontend).not.toHaveBeenCalled();
});


it('refreshes only changed runtimes and leaves unrelated actors and selection intact', async () => {
  const entries = [{ id: 'ext', registrationId: 'first' }, { id: 'other', registrationId: 'unchanged' }];
  loadedPacksQuery.mockResolvedValue(entries);
  loadPackFrontend.mockImplementation(pack => Promise.resolve([plugin(`${pack.id}/own`)]));
  connect();
  await settle();
  app.send({ type: 'SELECT_PLUGIN', plugin: 'other/own' });
  const other = app.system.get('other/own');
  const previous = app.system.get('ext/own');
  loadPackFrontend.mockClear();
  packClientReady.mockClear();
  loadedPacksQuery.mockResolvedValue([{ ...entries[0], registrationId: 'second' }, entries[1]]);
  fake.receive({ to: 'host/application', event: { type: 'PACK_RUNTIMES_UPDATED', runtimes: { ext: 'second', other: 'unchanged' } } });
  await settle();
  expect(loadPackFrontend.mock.calls.map(([pack]) => pack.id)).toEqual(['ext']);
  expect(app.system.get('other/own')).toBe(other);
  expect(previous?.getSnapshot().status).toBe('stopped');
  expect(app.system.get('ext/own')).not.toBe(previous);
  expect(app.getSnapshot().context.activePlugin.id).toBe('other/own');
  expect(app.getSnapshot().context.acceptedPackRuntimes).toEqual({ ext: 'second', other: 'unchanged' });
  expect(packClientReady.mock.calls).toEqual([['ext', 'second']]);
  expect(unloadPackFrontend).not.toHaveBeenCalled();
});

it('keeps the accepted epoch on refusal and retries a changed runtime on the next request', async () => {
  loadedPacksQuery.mockResolvedValue([{ id: 'ext', registrationId: 'first' }]);
  loadPackFrontend.mockResolvedValue([plugin('ext/own')]);
  connect();
  await settle();
  const previous = app.system.get('ext/own');
  loadedPacksQuery.mockResolvedValue([{ id: 'ext', registrationId: 'second' }]);
  loadPackFrontend.mockRejectedValueOnce(new Error('candidate refused'));
  fake.receive({ to: 'host/application', event: { type: 'PACK_RUNTIMES_UPDATED', runtimes: { ext: 'second' } } });
  await settle();
  expect(app.system.get('ext/own')).toBe(previous);
  expect(app.getSnapshot().context.acceptedPackRuntimes).toEqual({ ext: 'first' });
  app.send({ type: 'LOAD_PACK_FRONTENDS' });
  await settle();
  expect(loadPackFrontend).toHaveBeenCalledTimes(3);
  expect(app.getSnapshot().context.acceptedPackRuntimes).toEqual({ ext: 'second' });
  expect(packClientReady.mock.calls).toEqual([['ext', 'first'], ['ext', 'second']]);
});

it('uses runtime publication as a reconciliation hint and ignores unchanged revisions', async () => {
  loadedPacksQuery.mockResolvedValue([{ id: 'ext', registrationId: 'current' }]);
  loadPackFrontend.mockResolvedValue([plugin('ext/own')]);
  connect();
  await settle();
  const previous = app.system.get('ext/own');
  loadedPacksQuery.mockClear();
  fake.receive({ to: 'host/application', event: { type: 'PACK_RUNTIMES_UPDATED', runtimes: { ext: 'current' } } });
  await settle();
  expect(loadedPacksQuery).not.toHaveBeenCalled();
  // An older publication omitting this owner cannot remove it; the authoritative read still lists it.
  fake.receive({ to: 'host/application', event: { type: 'PACK_RUNTIMES_UPDATED', runtimes: {} } });
  await settle();
  expect(loadedPacksQuery).toHaveBeenCalledOnce();
  expect(app.system.get('ext/own')).toBe(previous);
  expect(loadPackFrontend).toHaveBeenCalledOnce();
  expect(unloadPackFrontend).not.toHaveBeenCalled();
});

it('queues a newer runtime received during preparation and accepts the latest revision afterward', async () => {
  loadedPacksQuery.mockResolvedValue([{ id: 'ext', registrationId: 'first' }]);
  let release!: (plugins: Plugin[]) => void;
  loadPackFrontend.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  loadPackFrontend.mockResolvedValue([plugin('ext/own')]);
  connect();
  await settle();
  loadedPacksQuery.mockResolvedValue([{ id: 'ext', registrationId: 'second' }]);
  fake.receive({ to: 'host/application', event: { type: 'PACK_RUNTIMES_UPDATED', runtimes: { ext: 'second' } } });
  expect(app.getSnapshot().context.packLoadQueued).toBe(true);
  release([plugin('ext/own')]);
  await settle();
  expect(loadPackFrontend).toHaveBeenCalledTimes(2);
  expect(app.getSnapshot().context.acceptedPackRuntimes).toEqual({ ext: 'second' });
  expect(packClientReady.mock.calls).toEqual([['ext', 'first'], ['ext', 'second']]);
});
