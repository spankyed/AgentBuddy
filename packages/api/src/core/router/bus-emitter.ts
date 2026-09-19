import { EventEmitter } from 'events';
import { appendCappedLine } from '@abuddy/host/logs';
import type { IncomingSystemEvents, OutgoingSystemEvents } from '@/core/router/events';
import type { LogEvent } from '@abuddy/sdk/logger';
import type { RootEvents } from '@abuddy/sdk/runtime';

function appendAppEventLog(event: LogEvent) {
  const logDir = process.env.AGENTBUDDY_LOG_DIR;
  if (!logDir) return;
  appendCappedLine(logDir, 'app-events.log', JSON.stringify({
    timestamp: new Date().toISOString(),
    startupId: process.env.AGENTBUDDY_STARTUP_ID,
    ...event,
  }) + '\n');
}

/** The app's event bus: what the SDK binds as HostRuntime.transport, and the tRPC routers serve */
class RootEventEmitter extends EventEmitter implements RootEvents {
  emit<K>(eventName: string | symbol, ...args: any[]): boolean {
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
  emitIncoming(event: IncomingSystemEvents) {
    this.emit('incoming', event);
  }

  /** A send to a plugin from outside a system, which the bus delivers once a client is connected */
  emitPluginSend(event: OutgoingSystemEvents) {
    this.emit('plugin-send', event);
  }

  emitOutgoing(event: OutgoingSystemEvents) {
    this.emit('outgoing', event);
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

  onPluginSend(callback: (event: OutgoingSystemEvents) => void) {
    this.on('plugin-send', callback);
    return () => this.off('plugin-send', callback);
  }

  // Subscribe to outgoing events
  onOutgoing(callback: (event: OutgoingSystemEvents) => void) {
    this.on('outgoing', callback);
    return () => this.off('outgoing', callback);
  }

  // Subscribe to incoming events
  onIncoming(callback: (event: IncomingSystemEvents) => void) {
    this.on('incoming', callback);
    return () => this.off('incoming', callback);
  }
}

// Single shared instance - the root event bus
export const rootEvents = new RootEventEmitter();
