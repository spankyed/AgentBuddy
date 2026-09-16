import { getHostModule } from './host.ts';
import type { LogEvent } from '../logger/index.ts';
import type { IncomingSystemEvents, OutgoingSystemEvents } from '../events/index.ts';

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

// Assigned by initRpc() — must not be a Proxy, because a get-only Proxy
// breaks EventEmitter's internal _eventsCount bookkeeping (writes to the
// proxy target instead of the real instance, causing all listeners to be
// wiped on unsubscribe). ESM live bindings ensure importers see the real
// instance after init.
/** @internal */
export let rootEvents: RootEvents;

/** @internal Host-only: the host wires the root event bus at boot. */
export function initRpc() {
  rootEvents = getHostModule<{ rootEvents: RootEvents }>('bus-emitter').rootEvents;
}
