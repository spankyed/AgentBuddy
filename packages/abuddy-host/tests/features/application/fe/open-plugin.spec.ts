// Opening a plugin is the shell's command (OPEN_PLUGIN), because only the shell knows which pack frontends are still
// loading: a plugin asked for while its pack loads opens once it arrives, one no pack provides is refused once
// loading settles, and one whose pack goes away meanwhile is dropped.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createActor, setup, type Actor } from 'xstate';
import type { Plugin } from '@abuddy/sdk/fe';
import { createShellMachine, type ShellMachine } from '../../../../src/fe/index.ts';
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
  expect(shell.notify.error).toHaveBeenCalledWith("Couldn't open memo-pack/memoz", 'No plugin is registered at "memo-pack/memoz"');
});

it('refuses at once a plugin no pack provides when no pack frontend is loading', async () => {
  await connectLoading([]);
  await settle();

  app.send({ type: 'OPEN_PLUGIN', plugin: 'memo-pack/memos', events: [] });

  expect(shell.notify.error).toHaveBeenCalledWith("Couldn't open memo-pack/memos", 'No plugin is registered at "memo-pack/memos"');
});

it('drops a request whose pack is unloaded while it waits', async () => {
  let loaded!: () => void;
  const release = new Promise<void>((resolve) => { loaded = resolve; });
  await connectLoading([{ id: 'memo-pack', plugins: [recording('memo-pack/memos')] }], release);

  app.send({ type: 'OPEN_PLUGIN', plugin: 'memo-pack/memos', events: [{ type: 'MEMO.OPEN', id: 'm1' }] });
  app.send({ type: 'PACK_PLUGINS_UNLOADED', packId: 'memo-pack' });
  loaded();
  await settle();

  expect(app.getSnapshot().context.pendingOpens).toEqual([]);
  expect(opened()).toBe('default-setup/notes');
  expect(eventsOf('memo-pack/memos')).toEqual([]);
  expect(shell.notify.error).not.toHaveBeenCalled();
});

// A pack's system or action asks the app to open a plugin with sendToPlugin('host/application', …); every window
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

