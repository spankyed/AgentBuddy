// A pack's plugins join the application actor when its frontend loads, and leave when the pack is
// deactivated. Only the plugins the pack added are its own: a plugin whose id the app already has stays.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, setup, type Actor } from 'xstate';
import type { Plugin } from '@/core/types';

const subscription = vi.hoisted(() => ({ onData: undefined as ((event: unknown) => void) | undefined }));
const packClientReady = vi.hoisted(() => vi.fn<(input: { packId: string }) => Promise<void>>());

vi.mock('@/core/trpc', () => ({
  trpc: {
    bus: {
      sub: {
        subscribe: (_input: unknown, handlers: { onData(event: unknown): void }) => {
          subscription.onData = handlers.onData;
          return { unsubscribe: () => {} };
        },
      },
      packClientReady: { mutate: packClientReady },
    },
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
    systemId: 'application',
    input: { plugins: [builtInNotes], defaultPlugin: builtInNotes, restoreLastActivePlugin: false },
  }).start();
});

afterEach(() => app.stop());

const connect = () => subscription.onData!({ pluginId: 'application', type: 'CLIENT_CONNECTED', hasOnboarded: true });

describe('pack plugins in the application actor', () => {
  it("asks for a pack's startup data once its plugin actors exist, after the connection", () => {
    connect();
    let spawnedWhenAsked = false;
    packClientReady.mockImplementation(async () => { spawnedWhenAsked = app.system.get('pack-own') !== undefined; });

    app.send({ type: 'PACK_PLUGINS_LOADED', packId: 'ext', plugins: [plugin('pack-own')] });

    expect(packClientReady).toHaveBeenCalledTimes(1);
    expect(packClientReady).toHaveBeenCalledWith({ packId: 'ext' });
    expect(spawnedWhenAsked).toBe(true);
  });

  it('asks once the connection comes for a pack whose plugins loaded before it', () => {
    app.send({ type: 'PACK_PLUGINS_LOADED', packId: 'ext', plugins: [plugin('pack-own')] });
    expect(app.system.get('pack-own')).toBeDefined();
    expect(packClientReady).not.toHaveBeenCalled();

    connect();
    expect(packClientReady).toHaveBeenCalledTimes(1);
    expect(packClientReady).toHaveBeenCalledWith({ packId: 'ext' });
  });

  it('asks again on reconnecting, for each pack whose plugins it holds', () => {
    connect();
    app.send({ type: 'PACK_PLUGINS_LOADED', packId: 'ext', plugins: [plugin('pack-own')] });
    packClientReady.mockClear();

    connect();
    expect(packClientReady).toHaveBeenCalledTimes(1);
    expect(packClientReady).toHaveBeenCalledWith({ packId: 'ext' });
  });

  it("adds nothing and doesn't ask when every plugin's id is taken", () => {
    connect();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    app.send({ type: 'PACK_PLUGINS_LOADED', packId: 'ext', plugins: [plugin('notes')] });
    warn.mockRestore();

    expect(app.getSnapshot().context.plugins).toEqual([builtInNotes]);
    expect(packClientReady).not.toHaveBeenCalled();
  });

  it('removes only the plugins the pack added, leaving a built-in plugin with an id it declared', () => {
    connect();
    const notesActor = app.system.get('notes');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    app.send({ type: 'PACK_PLUGINS_LOADED', packId: 'ext', plugins: [plugin('notes'), plugin('pack-own')] });
    warn.mockRestore();

    app.send({ type: 'PACK_PLUGINS_UNLOADED', packId: 'ext' });

    const { plugins, packPluginIds } = app.getSnapshot().context;
    expect(plugins).toEqual([builtInNotes]);
    expect(packPluginIds).toEqual({});
    expect(app.system.get('pack-own')).toBeUndefined();
    expect(app.system.get('notes')).toBe(notesActor);
    expect(notesActor.getSnapshot().status).toBe('active');
  });
});
