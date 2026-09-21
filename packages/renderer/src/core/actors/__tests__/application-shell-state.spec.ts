// The app shell's state (which plugins' tabs show, the plugin last open) belongs to the host's `application`
// feature, which keeps it in AppState. A window opens on its first plugin, and each connection's CLIENT_CONNECTED
// brings the stored state; what the user changes here is sent back to be recorded, so every window agrees.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createActor, setup, type Actor } from 'xstate';
import type { Plugin } from '@/core/types';

type SubscriptionHandlers = { onData(event: unknown): void; onStarted(): void };
const subscription = vi.hoisted(() => ({ handlers: undefined as SubscriptionHandlers | undefined }));
const mutate = vi.hoisted(() => vi.fn((_event: unknown) => Promise.resolve()));

vi.mock('@/core/trpc', () => ({
  trpc: {
    bus: {
      sub: { subscribe: (_input: unknown, handlers: SubscriptionHandlers) => { subscription.handlers = handlers; return { unsubscribe: () => {} }; } },
      send: { mutate },
      packClientReady: { mutate: () => Promise.resolve() },
    },
    packs: { loaded: { query: () => Promise.resolve([]) } },
  },
}));

const { createApplicationState } = await import('@/core/actors/application');

function plugin(id: string): Plugin {
  return { id, label: id, icon: 'Zap', state: setup({}).createMachine({}), canvas: {} } as unknown as Plugin;
}

const notes = plugin('default-setup/notes');
const threads = plugin('default-setup/threads');
let app: Actor<ReturnType<typeof createApplicationState>>;

beforeEach(() => {
  mutate.mockClear();
  app = createActor(createApplicationState(), {
    systemId: 'host/application',
    input: { plugins: [notes, threads], defaultPlugin: notes, restoreLastActivePlugin: true },
  }).start();
});

afterEach(() => app.stop());

const connect = (shell: { pluginVisibility?: Record<string, boolean>; lastActivePlugin?: string }) => {
  subscription.handlers!.onStarted();
  subscription.handlers!.onData({ pluginId: 'host/application', type: 'CLIENT_CONNECTED', hasOnboarded: true, pluginVisibility: {}, ...shell });
};
const context = () => app.getSnapshot().context;

it('opens on its first plugin, then on the one last open once the host says which', () => {
  expect(context().activePlugin.id).toBe('default-setup/notes');

  connect({ lastActivePlugin: 'default-setup/threads' });

  expect(context().activePlugin.id).toBe('default-setup/threads');
});

it('stays where it is when the plugin last open is not one it has', () => {
  connect({ lastActivePlugin: 'memo-pack/memos' });

  expect(context().activePlugin.id).toBe('default-setup/notes');
});

it("shows the tabs the host's state says to", () => {
  connect({ pluginVisibility: { 'default-setup/threads': false } });

  expect(context().visiblePlugins.map((p) => p.id)).toEqual(['default-setup/notes']);
});

it('hides a tab at once, and sends the host the choice to record', () => {
  app.send({ type: 'SET_PLUGIN_VISIBILITY', pluginId: 'default-setup/threads', visible: false });

  expect(context().visiblePlugins.map((p) => p.id)).toEqual(['default-setup/notes']);
  expect(mutate).toHaveBeenCalledWith({ systemId: 'host/application', type: 'SET_PLUGIN_VISIBILITY', pluginId: 'default-setup/threads', visible: false });
});

it('sends the host the plugin opened, to open on next time', () => {
  app.send({ type: 'SELECT_PLUGIN', pluginId: 'default-setup/threads' });

  expect(mutate).toHaveBeenCalledWith({ systemId: 'host/application', type: 'SET_LAST_ACTIVE_PLUGIN', pluginId: 'default-setup/threads' });
});
