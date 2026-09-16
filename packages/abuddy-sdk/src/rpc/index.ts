import { getHostModule } from '../runtime/host.ts';
import type { LogEvent } from '../logger/index.ts';
import type { SecretInfo, SecretProvider, SecretsStatus } from '../services/secrets.ts';

import type { IncomingSystemEvents, OutgoingSystemEvents } from '../events/index.ts';

/** The user's stored keys (without values) and how they're protected */
export interface SecretsSnapshot {
  secrets: SecretInfo[];
  status: SecretsStatus;
}

/** The tRPC procedures a pack's frontend calls */
export interface RpcClient {
  bus: {
    send: { mutate(event: IncomingSystemEvents): Promise<void> };
  };
  /**
   * The user's API keys. Values go in through `add` and `replaceValue` only, off the event bus, so they reach no
   * log, event or listener; no procedure returns one.
   */
  secrets: {
    list: { query(): Promise<SecretsSnapshot> };
    add: { mutate(input: { provider: SecretProvider; label: string; value: string }): Promise<SecretsSnapshot> };
    replaceValue: { mutate(input: { id: string; value: string }): Promise<SecretsSnapshot> };
    select: { mutate(input: { id: string }): Promise<SecretsSnapshot> };
    rename: { mutate(input: { id: string; label: string }): Promise<SecretsSnapshot> };
    delete: { mutate(input: { id: string }): Promise<SecretsSnapshot> };
    /** Where there's no OS credential store: store keys with a data key kept in a file, as the user chose */
    allowUnprotected: { mutate(): Promise<SecretsSnapshot> };
  };
}

/** The backend's root event bus */
export interface RootEvents {
  emitLog(event: LogEvent): void;
  onLog(callback: (event: LogEvent) => void): () => void;
  onConnected(callback: () => void): () => void;
  onIncoming(callback: (event: IncomingSystemEvents) => void): () => void;
  onOutgoing(callback: (event: OutgoingSystemEvents) => void): () => void;
  emitOutgoing(event: OutgoingSystemEvents): void;
}

let _trpcMod: { trpc: RpcClient } | undefined;
function trpcMod() {
  return _trpcMod ??= getHostModule<{ trpc: RpcClient }>('trpc');
}

export const trpc: RpcClient = new Proxy({} as RpcClient, {
  get(_, prop: string) { return trpcMod().trpc[prop as keyof RpcClient]; },
});

// Assigned by initRpc() — must not be a Proxy, because a get-only Proxy
// breaks EventEmitter's internal _eventsCount bookkeeping (writes to the
// proxy target instead of the real instance, causing all listeners to be
// wiped on unsubscribe). ESM live bindings ensure importers see the real
// instance after init.
export let rootEvents: RootEvents;

/** @internal Host-only: the host wires the RPC client at boot. */
export function initRpc() {
  rootEvents = getHostModule<{ rootEvents: RootEvents }>('bus-emitter').rootEvents;
}
