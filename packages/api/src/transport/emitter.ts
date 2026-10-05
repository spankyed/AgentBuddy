import { EventEmitter } from 'events';
import { appendCappedLine } from '@abuddy/host/logs';
import { encodeJsonSafely } from '@/transport/encoder';
import type { Message } from '@abuddy/sdk/events';
import type { LogEvent } from '@abuddy/sdk/logger';
import type { RootEvents } from '@abuddy/sdk/runtime';

/**
 * Writes one log event to `app-events.log`, and cannot fail the call that logged it.
 *
 * That matters more than it looks: this runs before `emitLog`'s own `emit`, so a throw here costs three things
 * at once — the line, the event reaching the console printer and the logs system, and the caller, which gets
 * the throw. A BigInt was enough to do it, `reportError`'s step path handing this `redactSecrets` output, which
 * passes one through untouched, and a bare `JSON.stringify` refusing it.
 *
 * Neither half needs a guard here, and a third one would only imply these two do not work: serialising is
 * `encodeJsonSafely`, which never throws, and writing is `appendCappedLine`, which swallows every write error on
 * the same reasoning. Sharing the socket's encoder means a log line describes a BigInt or a loop the way the
 * wire does — but **not** its last resort, which is a JSON-RPC frame and would be nonsense in a file something
 * else parses. So the placeholder here is still a log line, keeping what is known to be plain text and naming
 * what went wrong. It reports a cut through this same logger, which is one level of reentrancy and terminates:
 * that report's meta is an id and a reason, which the fast path takes.
 */
function appendAppEventLog(event: LogEvent) {
  const logDir = process.env.AGENTBUDDY_LOG_DIR;
  if (!logDir) return;
  const timestamp = new Date().toISOString();
  const startupId = process.env.AGENTBUDDY_STARTUP_ID;
  const line = encodeJsonSafely(
    { timestamp, startupId, ...event },
    (reason) => ({ timestamp, startupId, level: event.level, source: event.source, message: event.message, unserialisable: reason }),
  );
  appendCappedLine(logDir, 'app-events.log', `${line}\n`);
}

/** The app's event bus: what the SDK binds as HostRuntime.transport, and the tRPC routers serve */
class RootEventEmitter extends EventEmitter implements RootEvents {
  emit<_K>(eventName: string | symbol, ...args: any[]): boolean {
    return super.emit(eventName, ...args);
  }

  // Log-specific events
  emitLog(event: LogEvent) {
    appendAppEventLog(event);
    this.emit('log', event);
  }

  emitConnected() {
    this.emit('connected');
  }

  /** A client has loaded a pack's frontend (its plugin actors exist) and is ready for its systems' data */
  emitPackClientConnected(packId: string) {
    this.emit('pack-connected', packId);
  }

  // System bus events
  emitIncoming(message: Message) {
    this.emit('incoming', message);
  }

  /** A send to a plugin from outside a system, which the bus delivers once a client is connected */
  emitPluginSend(message: Message) {
    this.emit('plugin-send', message);
  }

  emitOutgoing(message: Message) {
    this.emit('outgoing', message);
  }

  onLog(callback: (event: LogEvent) => void) {
    this.on('log', callback);
    return () => this.off('log', callback);
  }

  onConnected(callback: () => void) {
    this.on('connected', callback);
    return () => this.off('connected', callback);
  }

  onPackClientConnected(callback: (packId: string) => void) {
    this.on('pack-connected', callback);
    return () => this.off('pack-connected', callback);
  }

  onPluginSend(callback: (message: Message) => void) {
    this.on('plugin-send', callback);
    return () => this.off('plugin-send', callback);
  }

  // Subscribe to outgoing events
  onOutgoing(callback: (message: Message) => void) {
    this.on('outgoing', callback);
    return () => this.off('outgoing', callback);
  }

  // Subscribe to incoming events
  onIncoming(callback: (message: Message) => void) {
    this.on('incoming', callback);
    return () => this.off('incoming', callback);
  }
}

// Single shared instance - the root event bus
export const rootEvents = new RootEventEmitter();
