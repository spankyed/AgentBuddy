// Opening a plugin is the shell's command (OPEN_PLUGIN), because only the shell knows which pack frontends are still
// loading: a plugin asked for while its pack loads opens once it arrives, one no pack provides is refused once
// loading settles, and one whose pack goes away meanwhile is dropped.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, setup, type Actor } from 'xstate';
import type { Plugin } from '@abuddy/sdk/fe';
import { createShellMachine, type ShellMachine } from '../../../../src/fe/index.ts';
import type { ShellEvent } from '../../../../src/features/application/fe/types.ts';
import { fakeShell, settle } from './fakes.ts';

/** What reached each plugin, in order, and whether it was open then */
let heard: Array<{ plugin: string; type: string; open: boolean }>;
let app: Actor<ShellMachine>;
let shell: ReturnType<typeof fakeShell>;

/** A plugin whose actor records every event it receives, and whether the shell had it open */
function recording(id: string): Plugin {
  const state = setup({}).createMachine({
    on: {
      '*': {
        actions: ({ event }) => {
          heard.push({ plugin: id, type: event.type, open: app?.getSnapshot().context.activePlugin.id === id });
        },
      },
    },
  });
  return { id, label: id, icon: 'Zap', state, canvas: {} } as unknown as Plugin;
}

const opened = () => app.getSnapshot().context.activePlugin.id;
const eventsOf = (plugin: string) => heard.filter((h) => h.plugin === plugin && !h.type.startsWith('PLUGIN_'));

beforeEach(() => {
  heard = [];
  shell = fakeShell({ plugins: [recording('default-setup/notes'), recording('default-setup/settings')] });
  app = createActor(createShellMachine(shell.options), { systemId: 'host/application', input: { ownsLastActivePlugin: false } }).start();
});

afterEach(() => app.stop());

/** The window connects and its pack frontend loader reads the loaded packs, loading `packs` */
async function connectLoading(packs: Array<{ id: string; plugins: Plugin[] }>, release?: Promise<void>) {
  shell.client.loadedPacks.mockResolvedValue(packs.map(({ id }) => ({ id, feEntry: 'runtime/fe.js' })));
  shell.packFrontends.load.mockImplementation(async (pack) => {
    await release;
    return packs.find((p) => p.id === pack.id)?.plugins ?? null;
  });
  shell.client.connect();
}

it('opens a registered plugin and hands it the events, once it is open', async () => {
  await connectLoading([]);
  await settle();

  app.send({ type: 'OPEN_PLUGIN', plugin: 'default-setup/settings', events: [{ type: 'PLUGIN.SELECT', pluginId: 'default-setup/logs' }] });

  expect(opened()).toBe('default-setup/settings');
  expect(eventsOf('default-setup/settings')).toEqual([{ plugin: 'default-setup/settings', type: 'PLUGIN.SELECT', open: true }]);
});

it("waits for a plugin whose pack's frontend is still loading, and opens it with the events once it arrives", async () => {
  let loaded!: () => void;
  const release = new Promise<void>((resolve) => { loaded = resolve; });
  await connectLoading([{ id: 'memo-pack', plugins: [recording('memo-pack/memos')] }], release);

  app.send({ type: 'OPEN_PLUGIN', plugin: 'memo-pack/memos', events: [{ type: 'MEMO.OPEN', id: 'm1' }] });
  expect(opened()).toBe('default-setup/notes');
  expect(shell.notify.error).not.toHaveBeenCalled();

  loaded();
  await settle();

  expect(opened()).toBe('memo-pack/memos');
  expect(eventsOf('memo-pack/memos')).toEqual([{ plugin: 'memo-pack/memos', type: 'MEMO.OPEN', open: true }]);
  expect(shell.notify.error).not.toHaveBeenCalled();
});

it('refuses a plugin no pack provides once loading settles, naming it', async () => {
  let loaded!: () => void;
  const release = new Promise<void>((resolve) => { loaded = resolve; });
  await connectLoading([{ id: 'memo-pack', plugins: [recording('memo-pack/memos')] }], release);

  app.send({ type: 'OPEN_PLUGIN', plugin: 'memo-pack/memoz', events: [] });
  loaded();
  await settle();

  expect(opened()).toBe('default-setup/notes');
  expect(shell.notify.error).toHaveBeenCalledWith("Couldn't open memo-pack/memoz", 'No plugin is registered at "memo-pack/memoz".');
});

it('refuses at once a plugin no pack provides when no pack frontend is loading', async () => {
  await connectLoading([]);
  await settle();

  app.send({ type: 'OPEN_PLUGIN', plugin: 'memo-pack/memos', events: [] });

  expect(shell.notify.error).toHaveBeenCalledWith("Couldn't open memo-pack/memos", 'No plugin is registered at "memo-pack/memos".');
});

it('drops a request whose pack is unloaded while it waits', async () => {
  let loaded!: () => void;
  const release = new Promise<void>((resolve) => { loaded = resolve; });
  await connectLoading([{ id: 'memo-pack', plugins: [recording('memo-pack/memos')] }], release);

  app.send({ type: 'OPEN_PLUGIN', plugin: 'memo-pack/memos', events: [{ type: 'MEMO.OPEN', id: 'm1' }] });
  app.send({ type: 'PACK_PLUGINS_UNLOADED', packId: 'memo-pack' });
  loaded();
  await settle();

  expect(app.getSnapshot().context.awaitingPlugin).toEqual([]);
  expect(opened()).toBe('default-setup/notes');
  expect(eventsOf('memo-pack/memos')).toEqual([]);
  expect(shell.notify.error).not.toHaveBeenCalled();
});

// SEND_TO_PLUGIN is the same wait with a different ending: the renderer's `sendToPlugin` (`_sendToLocalPlugin`)
// routes through here rather than reaching into the plugin's actor, so one owner answers "is that plugin here yet"
// for both channels. What it must not do is open the plugin — a cross-feature command is not a navigation.
it('hands a registered plugin its events without opening it', async () => {
  await connectLoading([]);
  await settle();

  app.send({ type: 'SEND_TO_PLUGIN', plugin: 'default-setup/settings', events: [{ type: 'PLUGIN.SELECT', pluginId: 'default-setup/logs' }] });
  await settle();

  expect(opened()).toBe('default-setup/notes');
  expect(eventsOf('default-setup/settings')).toEqual([{ plugin: 'default-setup/settings', type: 'PLUGIN.SELECT', open: false }]);
});

it("waits for a plugin whose pack's frontend is still loading, and delivers once it arrives, still without opening it", async () => {
  let loaded!: () => void;
  const release = new Promise<void>((resolve) => { loaded = resolve; });
  await connectLoading([{ id: 'memo-pack', plugins: [recording('memo-pack/memos')] }], release);

  app.send({ type: 'SEND_TO_PLUGIN', plugin: 'memo-pack/memos', events: [{ type: 'MEMO.HIGHLIGHT', memoId: 'm1' }] });
  expect(eventsOf('memo-pack/memos')).toEqual([]);

  loaded();
  await settle();

  expect(eventsOf('memo-pack/memos')).toEqual([{ plugin: 'memo-pack/memos', type: 'MEMO.HIGHLIGHT', open: false }]);
  expect(opened()).toBe('default-setup/notes');
  expect(shell.notify.error).not.toHaveBeenCalled();
});

/**
 * The case where naming the sender is worth most, and the case that named nobody until the queue carried it: the
 * plugin's pack never loaded, so the send waited and was refused at the end of loading rather than at once.
 */
it('names the sender of a send that waited for a pack that never provided the plugin', async () => {
  let loaded!: () => void;
  const release = new Promise<void>((resolve) => { loaded = resolve; });
  await connectLoading([{ id: 'memo-pack', plugins: [recording('memo-pack/memos')] }], release);

  app.send({ type: 'SEND_TO_PLUGIN', plugin: 'memo-pack/memoz', events: [{ type: 'X' }], from: 'other-pack', via: 'action:Add Memo' });
  loaded();
  await settle();

  expect(shell.notify.error).toHaveBeenCalledWith(
    "Couldn't reach memo-pack/memoz",
    'No plugin is registered at "memo-pack/memoz". Sent by "other-pack" (action:Add Memo).',
  );
});

/**
 * The guard for the class rather than for one field. Refusing at once and refusing after a wait are two branches
 * of the same answer, so they have to say the same thing; they did not, and the difference was the sender and a
 * full stop. One renderer makes divergence impossible, and this fails if anyone reintroduces a second.
 */
it('says exactly the same thing whether it refuses at once or after waiting', async () => {
  const send: ShellEvent = { type: 'SEND_TO_PLUGIN', plugin: 'memo-pack/memoz', events: [{ type: 'X' }], from: 'other-pack', via: 'action:Add Memo' };

  let loaded!: () => void;
  const release = new Promise<void>((resolve) => { loaded = resolve; });
  await connectLoading([{ id: 'memo-pack', plugins: [recording('memo-pack/memos')] }], release);
  app.send({ ...send });
  loaded();
  await settle();
  const afterWaiting = (shell.notify.error as ReturnType<typeof vi.fn>).mock.calls.at(-1);

  // Loading has settled, so the same send is now refused on the other branch
  app.send({ ...send });
  await settle();
  const atOnce = (shell.notify.error as ReturnType<typeof vi.fn>).mock.calls.at(-1);

  expect(atOnce).toEqual(afterWaiting);
});

it('reports a send to a plugin no pack provides once loading settles, saying it could not reach it', async () => {
  let loaded!: () => void;
  const release = new Promise<void>((resolve) => { loaded = resolve; });
  await connectLoading([{ id: 'memo-pack', plugins: [recording('memo-pack/memos')] }], release);

  app.send({ type: 'SEND_TO_PLUGIN', plugin: 'memo-pack/memoz', events: [{ type: 'X' }] });
  loaded();
  await settle();

  expect(shell.notify.error).toHaveBeenCalledWith("Couldn't reach memo-pack/memoz", 'No plugin is registered at "memo-pack/memoz".');
});

// A pack's system or action asks the app to open a plugin with broadcastToPlugin('host/application', …); every window
// hears it, and only a main window acts: a popout shows its own plugin
describe('a request from the app to open a plugin', () => {
  it('opens the plugin in a main window, with the events', async () => {
    // The fake client holds one window's subscription: this test's window is a main one
    app.stop();
    app = createActor(createShellMachine(shell.options), { systemId: 'host/application', input: { ownsLastActivePlugin: true } }).start();
    shell.client.connect();
    shell.client.receive({ to: 'host/application', event: { type: 'CLIENT_CONNECTED', hasOnboarded: true, pluginVisibility: {} } });
    await settle();

    shell.client.receive({ to: 'host/application', event: { type: 'OPEN_PLUGIN', plugin: 'default-setup/settings', events: [{ type: 'PLUGIN.SELECT', pluginId: 'default-setup/logs' }] } });
    await settle();

    expect(opened()).toBe('default-setup/settings');
    expect(eventsOf('default-setup/settings')).toEqual([{ plugin: 'default-setup/settings', type: 'PLUGIN.SELECT', open: true }]);
  });

  // A pack builds the payload at runtime (an action, a flow), where its types don't reach: events that aren't
  // deliverable would crash the plugin's actor, or the shell's
  it.each([
    ['events that are not an array', 'two'],
    ['an event that is not an object', [null]],
    ['an event without a type', [{ id: 'm1' }]],
  ])('refuses %s, and opens nothing', async (_, events) => {
    app.stop();
    app = createActor(createShellMachine(shell.options), { systemId: 'host/application', input: { ownsLastActivePlugin: true } }).start();
    shell.client.connect();
    shell.client.receive({ to: 'host/application', event: { type: 'CLIENT_CONNECTED', hasOnboarded: true, pluginVisibility: {} } });
    await settle();

    shell.client.receive({ to: 'host/application', event: { type: 'OPEN_PLUGIN', plugin: 'default-setup/settings', events } });
    await settle();

    expect(opened()).toBe('default-setup/notes');
    expect(eventsOf('default-setup/settings')).toEqual([]);
    expect(shell.notify.error).toHaveBeenCalledWith("Couldn't open a plugin", expect.stringContaining('default-setup/settings'));
    expect(app.getSnapshot().status).toBe('active');
  });

  it('leaves a popout on the plugin it shows', async () => {
    await connectLoading([]);
    await settle();

    shell.client.receive({ to: 'host/application', event: { type: 'OPEN_PLUGIN', plugin: 'default-setup/settings', events: [{ type: 'PLUGIN.SELECT', pluginId: 'default-setup/logs' }] } });
    await settle();

    expect(opened()).toBe('default-setup/notes');
    expect(eventsOf('default-setup/settings')).toEqual([]);
  });
});

