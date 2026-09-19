// The application actor loads external packs' frontends from the loaded-packs list whenever this window's bus
// subscription is established: a query that fails leaves the packs unloaded until the next connection,
// which loads them and announces them so their systems send their startup data. A pack already loaded
// isn't loaded again.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, setup, type Actor } from 'xstate';
import type { Plugin } from '@/core/types';

type SubscriptionHandlers = {
  onData(event: unknown): void;
  onStarted(): void;
  onConnectionStateChange(state: { state: string }): void;
};
const subscription = vi.hoisted(() => ({ handlers: undefined as SubscriptionHandlers | undefined }));
const packClientReady = vi.hoisted(() => vi.fn<(input: { packId: string }) => Promise<void>>());
const loadedPacksQuery = vi.hoisted(() => vi.fn<() => Promise<unknown[]>>());
const loadPackFrontend = vi.hoisted(() => vi.fn<(pack: { id: string }) => Promise<Plugin[] | null>>());
const unloadPackFrontend = vi.hoisted(() => vi.fn<(packId: string) => void>());
const toastError = vi.hoisted(() => vi.fn<(message: string, description?: string) => void>());

vi.mock('@/core/trpc', () => ({
  trpc: {
    bus: {
      sub: {
        subscribe: (_input: unknown, handlers: SubscriptionHandlers) => {
          subscription.handlers = handlers;
          return { unsubscribe: () => {} };
        },
      },
      packClientReady: { mutate: packClientReady },
    },
    packs: { loaded: { query: loadedPacksQuery } },
  },
}));

vi.mock('@/packs/pack-loader', () => ({ loadPackFrontend, unloadPackFrontend }));
vi.mock('@/core/toast', () => ({ globalToast: { error: toastError, success: vi.fn(), info: vi.fn() } }));

const { createApplicationState } = await import('@/core/actors/application');

function plugin(id: string): Plugin {
  return { id, label: id, icon: 'Zap', state: setup({}).createMachine({}), canvas: {} } as unknown as Plugin;
}

/** Lets the loader's query for the loaded packs and its frontend loads settle */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

let app: Actor<ReturnType<typeof createApplicationState>>;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  packClientReady.mockReset().mockResolvedValue(undefined);
  loadedPacksQuery.mockReset();
  loadPackFrontend.mockReset();
  unloadPackFrontend.mockReset();
  toastError.mockReset();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const notes = plugin('notes');
  app = createActor(createApplicationState(), {
    systemId: 'application',
    input: { plugins: [notes], defaultPlugin: notes, restoreLastActivePlugin: false },
  }).start();
});

afterEach(() => {
  app.stop();
  warn.mockRestore();
});

/** This window's subscription is established */
const connect = () => subscription.handlers!.onStarted();
const dropConnection = () => subscription.handlers!.onConnectionStateChange({ state: 'connecting' });

describe('loading pack frontends from the loaded packs', () => {
  it('loads the packs on a later connection when the first query fails', async () => {
    loadedPacksQuery.mockRejectedValueOnce(new Error('connection closed'));

    connect();
    await settle();

    expect(loadPackFrontend).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[pack-loader] Failed to read the loaded packs:', 'connection closed');

    loadedPacksQuery.mockResolvedValue([{ id: 'ext', feEntry: 'runtime/fe.js' }]);
    loadPackFrontend.mockResolvedValue([plugin('pack-own')]);

    dropConnection();
    connect();
    await settle();

    expect(loadPackFrontend).toHaveBeenCalledTimes(1);
    expect(app.getSnapshot().context.packPluginIds).toEqual({ ext: ['pack-own'] });
    expect(app.system.get('pack-own')).toBeDefined();
    expect(packClientReady).toHaveBeenCalledWith({ packId: 'ext' });
  });

  it("doesn't load a pack again once its frontend is loaded, and never loads a built-in pack", async () => {
    loadedPacksQuery.mockResolvedValue([
      { id: 'default-setup', builtIn: true },
      { id: 'ext', feEntry: 'runtime/fe.js' },
    ]);
    loadPackFrontend.mockResolvedValue([plugin('pack-own')]);

    connect();
    await settle();

    expect(loadPackFrontend.mock.calls.map(([pack]) => pack.id)).toEqual(['ext']);

    dropConnection();
    connect();
    await settle();

    expect(loadPackFrontend).toHaveBeenCalledTimes(1);
    expect(app.getSnapshot().context.packPluginIds).toEqual({ ext: ['pack-own'] });
  });

  it('loads a pack activated while a load is running, whose read predates it', async () => {
    let releaseFirstQuery: (packs: unknown[]) => void = () => {};
    loadedPacksQuery.mockReturnValueOnce(new Promise<unknown[]>(resolve => { releaseFirstQuery = resolve; }));

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
    expect(app.getSnapshot().context.packPluginIds).toEqual({ ext: ['ext-plugin'], installed: ['installed-plugin'] });
  });

  it("drops the result of a load for a pack unloaded while it was running", async () => {
    loadedPacksQuery.mockResolvedValue([{ id: 'ext', feEntry: 'runtime/fe.js' }]);
    let releaseLoad: (plugins: Plugin[]) => void = () => {};
    loadPackFrontend.mockResolvedValue([plugin('pack-own')]);
    loadPackFrontend.mockReturnValueOnce(new Promise<Plugin[]>(resolve => { releaseLoad = resolve; }));

    connect();
    await settle();

    // The pack is uninstalled while its frontend is still loading
    app.send({ type: 'PACK_PLUGINS_UNLOADED', packId: 'ext' });
    releaseLoad([plugin('pack-own')]);
    await settle();

    const { plugins, packPluginIds, packFrontendsLoaded } = app.getSnapshot().context;
    expect(plugins.map(p => p.id)).toEqual(['notes']);
    expect(packPluginIds).toEqual({});
    expect(packFrontendsLoaded).toEqual([]);
    expect(app.system.get('pack-own')).toBeUndefined();
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

    expect(app.getSnapshot().context.packPluginIds).toEqual({ bad: [], good: ['good-plugin'] });
    expect(app.system.get('good-plugin')).toBeDefined();
    // The failure names the pack, not the read, which succeeded
    expect(toastError).toHaveBeenCalledWith("Couldn't load bad", 'styles blew up');
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalledWith('[pack-loader] Failed to read the loaded packs:', expect.anything());
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
    expect(warn).toHaveBeenCalledWith('[pack-loader] Failed to read the loaded packs:', 'connection closed');
  });

  it("records a pack whose frontend is styles alone, and doesn't load it again", async () => {
    loadedPacksQuery.mockResolvedValue([{ id: 'styles-only', feStyles: 'runtime/fe.css' }]);
    loadPackFrontend.mockResolvedValue(null);

    connect();
    await settle();

    const { packFrontendsLoaded, packPluginIds } = app.getSnapshot().context;
    expect(packFrontendsLoaded).toEqual(['styles-only']);
    // It has no systems waiting on a frontend, so it's neither merged nor announced
    expect(packPluginIds).toEqual({});
    expect(packClientReady).not.toHaveBeenCalled();

    dropConnection();
    connect();
    await settle();

    expect(loadPackFrontend).toHaveBeenCalledTimes(1);
  });
});
