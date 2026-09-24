// The two sends differ in reach, and nothing pinned it until now — which is how `OPEN_PLUGIN_FROM_APP` came about:
// a backend `OPEN_PLUGIN` reaches every window, so a popout would have followed the main window's navigation, and
// the event had to be renamed and guarded per window instead.
//
// `broadcastToPlugin` (backend, over the bus) reaches **every** window showing that plugin, because a plugin runs
// once per window. The renderer's `sendToPlugin` reaches this window's only. Two shells over one backend is the
// cheapest faithful way to say that: each shell is a window, and the bus delivers to both subscriptions.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, setup, type Actor } from 'xstate';
import type { Plugin } from '@abuddy/sdk/fe';
import { createShellMachine, type ShellMachine } from '../../../../src/fe/index.ts';
import { fakeShell, settle } from './fakes.ts';

/** What each window's copy of the plugin heard */
let heard: Array<{ window: string; type: string }>;

function recording(id: string, window: string): Plugin {
  const state = setup({}).createMachine({
    on: { '*': { actions: ({ event }) => { if (!event.type.startsWith('PLUGIN_')) heard.push({ window, type: event.type }); } } },
  });
  return { id, label: id, icon: 'Zap', state, canvas: {} } as unknown as Plugin;
}

/**
 * A window: its own shell, its own client subscription, its own copy of the plugin's actor. Each `createActor` is
 * its own XState system, so two windows' plugins can share an id — but the shell must be registered at
 * `host/application` in each, since that is the id its own code resolves plugins against.
 */
function windowNamed(name: string) {
  const shell = fakeShell({ plugins: [recording('default-setup/notes', name), recording('default-setup/threads', name)] });
  const app = createActor(createShellMachine(shell.options), { systemId: 'host/application', input: { ownsLastActivePlugin: false } }).start();
  shell.client.connect();
  return { shell, app };
}

let main: ReturnType<typeof windowNamed>;
let popout: ReturnType<typeof windowNamed>;

beforeEach(() => {
  heard = [];
  main = windowNamed('main');
  popout = windowNamed('popout');
});
afterEach(() => { main.app.stop(); popout.app.stop(); });

describe('how far each send reaches', () => {
  it('delivers a backend send to that plugin in every window', async () => {
    // What the bus does with a `broadcastToPlugin`: it goes out on every window's subscription
    for (const w of [main, popout]) w.shell.client.receive({ to: 'default-setup/threads', event: { type: 'SELECT_ARTIFACT', artifactId: 'a1' } });
    await settle();

    expect(heard).toEqual([
      { window: 'main', type: 'SELECT_ARTIFACT' },
      { window: 'popout', type: 'SELECT_ARTIFACT' },
    ]);
  });

  /**
   * A backend send reaches the window whole — the subscription carries the message, not just its event — so the
   * one warning the shell has for an undeliverable one can name the sender too. This is the third of the three
   * places a sender is worth saying; the bus covers its own drops and `notify.error` covers the in-window send.
   */
  it('names the sending pack when a backend send reaches no running plugin', async () => {
    await settle();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    main.shell.client.receive({ to: 'memo-pack/memoz', from: 'memo-pack', event: { type: 'MEMO_ADDED' } });
    await settle();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('No plugin is running at memo-pack/memoz for MEMO_ADDED sent by "memo-pack"'));
    warn.mockRestore();
  });

  /**
   * `Message.from` is stamped by the sends `#generated/events` builds, and the in-window send carries it on the
   * shell's `SEND_TO_PLUGIN`. It is worth carrying only if something reads it: this is the one place the renderer
   * can say who sent an event it couldn't deliver, and the backend's bus already does the same for its drops.
   */
  it('names the sending pack when the send reaches no plugin', async () => {
    await settle();

    main.app.send({ type: 'SEND_TO_PLUGIN', plugin: 'memo-pack/memoz', events: [{ type: 'ADD_MEMO' }], from: 'memo-pack' });
    await settle();

    expect(main.shell.notify.error).toHaveBeenCalledWith(
      "Couldn't reach memo-pack/memoz",
      'No plugin is registered at "memo-pack/memoz". Sent by "memo-pack".',
    );
  });

  // The host's own sends stamp nothing, so the message reads the same minus the clue rather than saying one is missing
  it('reads the same when the send carries no sender', async () => {
    await settle();

    main.app.send({ type: 'SEND_TO_PLUGIN', plugin: 'memo-pack/memoz', events: [{ type: 'ADD_MEMO' }] });
    await settle();

    expect(main.shell.notify.error).toHaveBeenCalledWith(
      "Couldn't reach memo-pack/memoz",
      'No plugin is registered at "memo-pack/memoz".',
    );
  });

  it("delivers the renderer's send to the window it was made in, and to no other", async () => {
    // Both windows have finished loading pack frontends, so neither has a reason to queue
    await settle();

    // What `_sendToLocalPlugin` does: one window's shell, never the bus
    main.app.send({ type: 'SEND_TO_PLUGIN', plugin: 'default-setup/threads', events: [{ type: 'SELECT_ARTIFACT', artifactId: 'a1' }] });
    await settle();

    expect(heard).toEqual([{ window: 'main', type: 'SELECT_ARTIFACT' }]);
    // And it went nowhere near the backend: routing it through the bus would have reached the popout too
    expect(main.shell.client.send).not.toHaveBeenCalled();
    expect(popout.shell.client.send).not.toHaveBeenCalled();
  });
});
