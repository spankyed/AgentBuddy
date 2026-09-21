// A pack's plugins join the application actor when its frontend loads, and leave when the pack is
// deactivated. Only the plugins the pack added are its own: a plugin whose id the app already has stays.
// Each pack whose frontend load finished is announced once per establishment of this window's bus
// subscription, so its systems send their startup data.
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
    // This window's pack frontend loader has nothing to load here; application-pack-loading.spec covers it
    packs: { loaded: { query: () => Promise.resolve([]) } },
  },
}));

const { createApplicationState } = await import('@/core/actors/application');

function plugin(id: string): Plugin {
  return { id, label: id, icon: 'Zap', state: setup({}).createMachine({}), canvas: {} } as unknown as Plugin;
}

let app: Actor<ReturnType<typeof createApplicationState>>;
let builtInNotes: Plugin;

beforeEach(() => {
  packClientReady.mockReset();
  packClientReady.mockResolvedValue(undefined);
  builtInNotes = plugin('notes');
  app = createActor(createApplicationState(), {
    systemId: 'host/application',
    input: { plugins: [builtInNotes], defaultPlugin: builtInNotes, restoreLastActivePlugin: false },
  }).start();
});

afterEach(() => app.stop());

/** The server's CLIENT_CONNECTED broadcast, which any window's connection sends every window */
const broadcastConnected = (hasOnboarded = true) =>
  subscription.handlers!.onData({ pluginId: 'host/application', type: 'CLIENT_CONNECTED', hasOnboarded, pluginVisibility: {} });
/** This window's subscription is established: the server broadcasts its CLIENT_CONNECTED */
const connect = (hasOnboarded = true) => {
  subscription.handlers!.onStarted();
  broadcastConnected(hasOnboarded);
};
const dropConnection = () => subscription.handlers!.onConnectionStateChange({ state: 'connecting' });

describe('pack plugins in the application actor', () => {
  it("asks for a pack's startup data once its plugin actors exist, after the connection", () => {
    connect();
    let spawnedWhenAsked = false;
    packClientReady.mockImplementation(async () => { spawnedWhenAsked = app.system.get('pack-own') !== undefined; });

    app.send({ type: 'PACK_FRONTEND_LOADED', packId: 'ext', plugins: [plugin('pack-own')] });

    expect(packClientReady).toHaveBeenCalledTimes(1);
    expect(packClientReady).toHaveBeenCalledWith({ packId: 'ext' });
    expect(spawnedWhenAsked).toBe(true);
  });

  it('asks once the connection comes for a pack whose plugins loaded before it', () => {
    app.send({ type: 'PACK_FRONTEND_LOADED', packId: 'ext', plugins: [plugin('pack-own')] });
    expect(app.system.get('pack-own')).toBeDefined();
    expect(packClientReady).not.toHaveBeenCalled();

    connect();
    expect(packClientReady).toHaveBeenCalledTimes(1);
    expect(packClientReady).toHaveBeenCalledWith({ packId: 'ext' });
  });

  it('asks again on reconnecting, for each pack whose frontend loaded', () => {
    connect();
    app.send({ type: 'PACK_FRONTEND_LOADED', packId: 'ext', plugins: [plugin('pack-own')] });
    app.send({ type: 'PACK_FRONTEND_LOADED', packId: 'failed', plugins: [] });
    packClientReady.mockClear();

    dropConnection();
    connect();
    expect(packClientReady.mock.calls).toEqual([[{ packId: 'ext' }], [{ packId: 'failed' }]]);
  });

  it('asks once, when the subscription is established again, for a pack loaded while the connection was down', () => {
    connect();
    dropConnection();
    app.send({ type: 'PACK_FRONTEND_LOADED', packId: 'ext', plugins: [plugin('pack-own')] });
    expect(packClientReady).not.toHaveBeenCalled();

    connect();
    expect(packClientReady).toHaveBeenCalledTimes(1);
  });

  it("doesn't ask again when another window's connection broadcasts CLIENT_CONNECTED", () => {
    connect();
    app.send({ type: 'PACK_FRONTEND_LOADED', packId: 'ext', plugins: [plugin('pack-own')] });
    packClientReady.mockClear();

    broadcastConnected();
    broadcastConnected();
    expect(packClientReady).not.toHaveBeenCalled();
  });

  it('asks for a pack whose frontend added no plugin: all ids taken, none exported, or failed to load', () => {
    connect();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    app.send({ type: 'PACK_FRONTEND_LOADED', packId: 'taken', plugins: [plugin('notes')] });
    warn.mockRestore();
    app.send({ type: 'PACK_FRONTEND_LOADED', packId: 'failed', plugins: [] });

    const { plugins, packPluginIds } = app.getSnapshot().context;
    expect(plugins).toEqual([builtInNotes]);
    expect(packPluginIds).toEqual({ taken: [], failed: [] });
    expect(packClientReady.mock.calls).toEqual([[{ packId: 'taken' }], [{ packId: 'failed' }]]);

    app.send({ type: 'PACK_PLUGINS_UNLOADED', packId: 'failed' });
    expect(app.getSnapshot().context.packPluginIds).toEqual({ taken: [] });
  });

  it('asks on connecting during onboarding and on the error page, and not again when onboarding completes', () => {
    connect(false);
    expect(app.getSnapshot().hasTag('onboarding')).toBe(true);
    app.send({ type: 'PACK_FRONTEND_LOADED', packId: 'ext', plugins: [plugin('pack-own')] });
    packClientReady.mockClear();

    // The API restarts during onboarding
    dropConnection();
    connect(false);
    expect(packClientReady).toHaveBeenCalledTimes(1);

    app.send({ type: 'ONBOARDING_COMPLETE' });
    expect(packClientReady).toHaveBeenCalledTimes(1);

    app.send({ type: 'BACKEND_ERROR', error: 'crashed' });
    expect(app.getSnapshot().matches('error')).toBe(true);
    dropConnection();
    subscription.handlers!.onStarted();
    expect(packClientReady).toHaveBeenCalledTimes(2);
  });

  // The plugins arrive under the ids they run under, so a pack with a `notes` feature of its own is a
  // second plugin beside the built-in one rather than a clash. What this pins is that unloading the pack
  // takes only its own.
  it("removes only the plugins the pack added, leaving a built-in plugin whose feature it shares", () => {
    connect();
    const notesActor = app.system.get('notes');
    app.send({ type: 'PACK_FRONTEND_LOADED', packId: 'ext', plugins: [plugin('ext/notes'), plugin('ext/pack-own')] });

    app.send({ type: 'PACK_PLUGINS_UNLOADED', packId: 'ext' });

    const { plugins, packPluginIds } = app.getSnapshot().context;
    expect(plugins).toEqual([builtInNotes]);
    expect(packPluginIds).toEqual({});
    expect(app.system.get('ext/pack-own')).toBeUndefined();
    expect(app.system.get('ext/notes')).toBeUndefined();
    expect(app.system.get('notes')).toBe(notesActor);
    expect(notesActor.getSnapshot().status).toBe('active');
  });
});
