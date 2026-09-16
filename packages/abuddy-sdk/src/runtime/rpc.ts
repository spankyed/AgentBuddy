import { getHostModule } from './host.ts';
import type { LogEvent } from '../logger/index.ts';
import type { SecretProvider, SecretsSnapshot } from '../services/secrets.ts';

import type { IncomingSystemEvents, OutgoingSystemEvents } from '../events/index.ts';

/**
 * The API client's procedures the SDK calls (`secretsClient`). The renderer registers its client as the `trpc` host module.
 * @internal
 */
export interface RpcClient {
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

/**
 * The backend's root event bus
 * @internal
 */
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

/** @internal */
export const trpc: RpcClient = new Proxy({} as RpcClient, {
  get(_, prop: string) { return trpcMod().trpc[prop as keyof RpcClient]; },
});

// Assigned by initRpc() — must not be a Proxy, because a get-only Proxy
// breaks EventEmitter's internal _eventsCount bookkeeping (writes to the
// proxy target instead of the real instance, causing all listeners to be
// wiped on unsubscribe). ESM live bindings ensure importers see the real
// instance after init.
/** @internal */
export let rootEvents: RootEvents;

/** @internal Host-only: the host wires the RPC client at boot. */
export function initRpc() {
  rootEvents = getHostModule<{ rootEvents: RootEvents }>('bus-emitter').rootEvents;
}
