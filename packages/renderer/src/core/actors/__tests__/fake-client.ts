// A client to no API, for the shell's specs: it records what the shell sends, answers with what a test sets, and lets
// the test play the connection (established, dropped, a message, a failure)
import { vi } from 'vitest';
import type { LoadedPackEntry, ShellClient, ShellConnection } from '@abuddy/host/fe';
import type { Message } from '@abuddy/sdk/events';

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
    fail: (error: string) => current().onFailed(error),
  };
}
