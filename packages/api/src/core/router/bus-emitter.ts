import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import type { IncomingSystemEvents, OutgoingSystemEvents } from '@/core/router/events';
import { LogEvent } from '../shared/debug/logger';

function appendAppEventLog(event: LogEvent) {
  const logDir = process.env.AGENTBUDDY_LOG_DIR;
  if (!logDir) return;

  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'app-events.log'), JSON.stringify({
      timestamp: new Date().toISOString(),
      startupId: process.env.AGENTBUDDY_STARTUP_ID,
      ...event,
    }) + '\n');
  } catch {
    // Logging must never break runtime event delivery.
  }
}

class RootEventEmitter extends EventEmitter {
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

  // System bus events
  emitIncoming(event: IncomingSystemEvents) {
    this.emit('incoming', event);
    // this.emit('incoming', event);
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
