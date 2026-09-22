// The Packs plugin asks the `host/packs` system for what it shows, and tells the shell when a pack's plugins
// are gone. It doesn't unload the pack's frontend itself: the shell loads a pack's frontend and the shell
// unloads it, so a pack that comes back is loaded once and taken out once.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createActor, type Actor } from 'xstate';
import type { Plugin } from '@abuddy/sdk/fe';
import { createShellMachine, type ShellMachine } from '../../../src/fe/index.ts';
import packsMachine from '../../../src/fe/packs/machine.ts';
import { fakeShell, plugin } from '../shell/fakes.ts';

let app: Actor<ShellMachine>;
let shell: ReturnType<typeof fakeShell>;

/** The Packs tab as the renderer registers it: the host's machine, with the view's components */
const packsPlugin = { id: 'host/packs', label: 'Packs', icon: 'Package', state: packsMachine, canvas: {} } as unknown as Plugin;

beforeEach(() => {
  shell = fakeShell({ plugins: [plugin('notes'), packsPlugin] });
  app = createActor(createShellMachine(shell.options), {
    systemId: 'host/application',
    input: { ownsLastActivePlugin: false },
  }).start();
  shell.client.connect();
  shell.client.receive({ to: 'host/application', event: { type: 'CLIENT_CONNECTED', hasOnboarded: true, pluginVisibility: {} } });
});

afterEach(() => app.stop());

/** What the `host/packs` system sent its plugin */
const receive = (event: Record<string, unknown>) => shell.client.receive({ to: 'host/packs', event: event as never });
const packsTab = () => app.system.get('host/packs') as Actor<typeof packsMachine>;

describe('the Packs plugin', () => {
  it("has the shell unload a deactivated pack's frontend, rather than unloading it itself", () => {
    receive({ type: 'PACK_DEACTIVATED', packId: 'memo-pack' });

    expect(shell.options.packFrontends.unload).toHaveBeenCalledWith('memo-pack');
  });

  it('shows the packs the system lists', () => {
    receive({ type: 'PACKS_LIST', packs: [{ id: 'memo-pack', name: 'Memos' }] });

    expect(packsTab().getSnapshot().context.packs).toEqual([{ id: 'memo-pack', name: 'Memos' }]);
  });
});
