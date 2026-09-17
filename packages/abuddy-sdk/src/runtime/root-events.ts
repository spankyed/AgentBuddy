import { boundHost } from './host-runtime.ts';
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
  /** A client loaded a pack's frontend and is ready for its systems' startup data */
  onPackClientConnected(callback: (packId: string) => void): () => void;
  /** An event for a backend system, which the bus routes while a client is connected */
  emitIncoming(event: IncomingSystemEvents): void;
  onIncoming(callback: (event: IncomingSystemEvents) => void): () => void;
  /** An event for a frontend plugin sent outside a system (`sendToPlugin`), which the bus delivers while a client is connected */
  emitPluginSend(event: OutgoingSystemEvents): void;
  onPluginSend(callback: (event: OutgoingSystemEvents) => void): () => void;
  /** An event the clients receive */
  emitOutgoing(event: OutgoingSystemEvents): void;
  onOutgoing(callback: (event: OutgoingSystemEvents) => void): () => void;
}

const bus = () => boundHost().transport.rootEvents;

/**
 * The bound app's root event bus. Each call goes to the bound bus's own method (not through a Proxy, which
 * would break an EventEmitter's listener bookkeeping); it throws, naming bindHost, when no app is bound.
 * @internal
 */
export const rootEvents: RootEvents = {
  emitLog: (event) => bus().emitLog(event),
  onLog: (callback) => bus().onLog(callback),
  onConnected: (callback) => bus().onConnected(callback),
  onPackClientConnected: (callback) => bus().onPackClientConnected(callback),
  emitIncoming: (event) => bus().emitIncoming(event),
  onIncoming: (callback) => bus().onIncoming(callback),
  emitPluginSend: (event) => bus().emitPluginSend(event),
  onPluginSend: (callback) => bus().onPluginSend(callback),
  emitOutgoing: (event) => bus().emitOutgoing(event),
  onOutgoing: (callback) => bus().onOutgoing(callback),
};
