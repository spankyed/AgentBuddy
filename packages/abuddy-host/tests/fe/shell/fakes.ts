// The shell's I/O, faked for its specs: a client to no API that the test plays the connection of, pack frontends the
// test loads, storage kept in memory, and records of what the shell reported to the user
import { vi } from 'vitest';
import { setup } from 'xstate';
import type { Message } from '@abuddy/sdk/events';
import type { Plugin, ShellPanelSizes } from '@abuddy/sdk/fe';
import type { LoadedPackEntry, ShellClient, ShellConnection, ShellFailure, ShellOptions } from '../../../src/fe/index.ts';

/** A plugin with an empty machine */
export function plugin(id: string): Plugin {
  return { id, label: id, icon: 'Zap', state: setup({}).createMachine({}), canvas: {} } as unknown as Plugin;
}

export function fakeClient() {
  let connection: ShellConnection | undefined;
  /** The connection the shell subscribed with; throws when it hasn't subscribed (or unsubscribed) */
  const current = (): ShellConnection => {
    if (!connection) throw new Error('The shell has no subscription to the fake client');
    return connection;
  };
  const mocks = {
    send: vi.fn<(message: Message) => void>(),
    packClientReady: vi.fn<(packId: string) => Promise<void>>(() => Promise.resolve()),
    // A test gives only the fields of a loaded pack the shell reads
    loadedPacks: vi.fn<() => Promise<Array<Partial<LoadedPackEntry> & { id: string }>>>(() => Promise.resolve([])),
    describeConnection: vi.fn<() => Promise<string>>(() => Promise.resolve('')),
  };
  const client: ShellClient = {
    ...mocks,
    loadedPacks: () => mocks.loadedPacks() as Promise<LoadedPackEntry[]>,
    subscribe: (next) => {
      connection = next;
      return () => { if (connection === next) connection = undefined; };
    },
  };
  return {
    client,
    ...mocks,
    /** This window's subscription is established */
    connect: () => current().onConnected(),
    /** The socket dropped */
    dropConnection: () => current().onDisconnected(),
    /** A backend system sent a plugin `message` */
    receive: (message: Message) => current().onMessage(message),
    /** The backend failed for good */
    fail: (error: ShellFailure) => current().onFailed(error),
  };
}

/** The shell's options over fakes, starting with `plugins` registered (the first is the default, unless one is given) */
export function fakeShell(start: { plugins: Plugin[]; defaultPlugin?: Plugin }) {
  const client = fakeClient();
  const packFrontends = {
    load: vi.fn<(pack: { id: string }) => Promise<Plugin[] | null>>(() => Promise.resolve(null)),
    unload: vi.fn<(packId: string) => void>(),
  };
  const notify = {
    error: vi.fn<(title: string, detail?: string) => void>(),
    errorPage: vi.fn<(title: string, detail: ShellFailure) => void>(),
  };
  let savedSizes: ShellPanelSizes | undefined;
  const storage = {
    loadPanelSizes: () => savedSizes,
    savePanelSizes: vi.fn((sizes: ShellPanelSizes) => { savedSizes = sizes; }),
  };
  const options: ShellOptions = {
    packs: { getRegisteredPlugins: () => start.plugins, getRegisteredDefaultPlugin: () => start.defaultPlugin ?? start.plugins[0] },
    client: client.client,
    packFrontends,
    storage,
    notify,
  };
  return { options, client, packFrontends, notify, storage };
}

/** Lets the loader's read of the loaded packs and its frontend loads settle */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
