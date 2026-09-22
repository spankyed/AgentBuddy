// The app shell's state (which plugins' tabs show, the plugin last open) belongs to the host's `application`
// feature, which keeps it in AppState. A window opens on its first plugin, and each connection's CLIENT_CONNECTED
// brings the stored state; what the user changes here is sent back to be recorded, so every window agrees.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createActor, type Actor } from 'xstate';
import { createShellMachine, visiblePluginsOf, withHostLast, type ShellMachine } from '../../../../src/fe/index.ts';
import { fakeShell, plugin } from './fakes.ts';

const notes = plugin('default-setup/notes');
const threads = plugin('default-setup/threads');
// What the shell sends the host goes over this window's client: the fake's `send`
const shell = fakeShell({ plugins: [notes, threads] });
const fake = shell.client;
const mutate = fake.send;
let app: Actor<ShellMachine>;

beforeEach(() => {
  mutate.mockClear();
  app = createActor(createShellMachine(shell.options), {
    systemId: 'host/application',
    input: { ownsLastActivePlugin: true },
  }).start();
});

afterEach(() => app.stop());

const connect = (shell: { pluginVisibility?: Record<string, boolean>; lastActivePlugin?: string }) => {
  fake.connect();
  fake.receive({ to: 'host/application', event: { type: 'CLIENT_CONNECTED', hasOnboarded: true, pluginVisibility: {}, ...shell } });
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

// An external pack's frontend loads after the window connects, so its plugin arrives later
const memos = plugin('memo-pack/memos');
const loadMemoPack = (target = app) => target.send({ type: 'PACK_FRONTEND_LOADED', packId: 'memo-pack', plugins: [memos] });

it("opens on the plugin last open once its pack's frontend adds it", () => {
  connect({ lastActivePlugin: 'memo-pack/memos' });
  loadMemoPack();

  expect(context().activePlugin.id).toBe('memo-pack/memos');
});

it('keeps the plugin the user opened while that pack was loading', () => {
  connect({ lastActivePlugin: 'memo-pack/memos' });
  app.send({ type: 'SELECT_PLUGIN', plugin: 'default-setup/threads' });
  loadMemoPack();

  expect(context().activePlugin.id).toBe('default-setup/threads');
});

it("opens a popout on an external pack's plugin once that pack's frontend adds it, without recording it as the app's", () => {
  const popout = createActor(createShellMachine(shell.options), {
    systemId: 'host/application',
    input: { initialPluginId: 'memo-pack/memos', ownsLastActivePlugin: false },
  }).start();

  loadMemoPack(popout);
  popout.send({ type: 'SELECT_PLUGIN', plugin: 'default-setup/threads' });

  expect(popout.getSnapshot().context.activePlugin.id).toBe('default-setup/threads');
  // The main window opens on the plugin last open there, never on one a popout showed
  const recorded = mutate.mock.calls.filter(([message]) => (message as { event: { type: string } }).event.type === 'SET_LAST_ACTIVE_PLUGIN');
  expect(recorded).toEqual([]);
  popout.stop();
});

it("shows the tabs the host's state says to", () => {
  connect({ pluginVisibility: { 'default-setup/threads': false } });

  expect(visiblePluginsOf(context()).map((p) => p.id)).toEqual(['default-setup/notes']);
});

it('hides a tab at once, and sends the host the choice to record', () => {
  app.send({ type: 'SET_PLUGIN_VISIBILITY', plugin: 'default-setup/threads', visible: false });

  expect(visiblePluginsOf(context()).map((p) => p.id)).toEqual(['default-setup/notes']);
  expect(mutate).toHaveBeenCalledWith({ to: 'host/application', event: { type: 'SET_PLUGIN_VISIBILITY', plugin: 'default-setup/threads', visible: false } });
});

it('sends the host the plugin opened, to open on next time', () => {
  app.send({ type: 'SELECT_PLUGIN', plugin: 'default-setup/threads' });

  expect(mutate).toHaveBeenCalledWith({ to: 'host/application', event: { type: 'SET_LAST_ACTIVE_PLUGIN', plugin: 'default-setup/threads' } });
});

// A pack's frontend loads after the window starts, and its plugins join before the app's own (the Packs tab)
it("keeps the host's plugins after every pack's, each group in its order", () => {
  const packsTab = plugin('host/packs');
  expect(withHostLast([notes, packsTab, threads, plugin('memo-pack/memos')]).map((p) => p.id))
    .toEqual(['default-setup/notes', 'default-setup/threads', 'memo-pack/memos', 'host/packs']);
});
