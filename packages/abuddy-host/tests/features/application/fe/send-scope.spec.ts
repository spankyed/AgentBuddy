// The two sends differ in reach, and nothing pinned it until now — which is how `OPEN_PLUGIN_FROM_APP` came about:
// a backend `OPEN_PLUGIN` reaches every window, so a popout would have followed the main window's navigation, and
// the event had to be renamed and guarded per window instead.
//
// `broadcastToPlugin` (backend, over the bus) reaches **every** window showing that plugin, because a plugin runs
// once per window. The renderer's `sendToPlugin` reaches this window's only. Two shells over one backend is the
// cheapest faithful way to say that: each shell is a window, and the bus delivers to both subscriptions.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
