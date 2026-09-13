import { getHostModule } from '../runtime/host.ts';
import type { LogEvent } from '../logger/index.ts';

/** An event for a backend system, as the bus receives it */
export type IncomingSystemEvents = { type: string; systemId: string; [key: string]: unknown };

/** An event for a frontend plugin, as the bus sends it */
export type OutgoingSystemEvents = { type: string; pluginId: string; [key: string]: unknown };

/** The tRPC procedures a pack's frontend calls */
export interface RpcClient {
  bus: {
    send: { mutate(event: IncomingSystemEvents): Promise<void> };
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
