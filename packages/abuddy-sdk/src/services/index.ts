import { getHostModule } from '../runtime/host';
import { repository } from '../ears';
import { getRegisteredServices } from '../packs';
import type { EARS, PluginEventRegistry, ServiceRegistry } from '../types/entities';
import type { Logger } from '../ears/runtime';

function lazyHost(name: string) {
  let m: any;
  return () => m ??= getHostModule(name);
}

// --- Event emitter (host-injected) ---
const emitter = lazyHost('event-emitter');

export function sendToPlugin<P extends keyof PluginEventRegistry & string>(
  pluginId: P, event: PluginEventRegistry[P]
): void;
export function sendToPlugin(pluginId: string, event: { type: string; [key: string]: any }): void;
export function sendToPlugin(pluginId: string, event: { type: string; [key: string]: any }): void {
  emitter().sendToPlugin(pluginId, event);
}

export function sendToBrainSystem(event: {
  eventType: string;
  payload?: any;
  targetFlowId?: EARS.EntityId;
}): void {
  emitter().sendToBrainSystem(event);
}

export function sendToSystem(systemId: string, event: { type: string; [key: string]: any }): void {
  emitter().sendToSystem(systemId, event);
}

export function onOutgoing(callback: (event: any) => void): () => void {
  return emitter().onOutgoing(callback);
}

export function onIncoming(callback: (event: any) => void): () => void {
  return emitter().onIncoming(callback);
}

// --- Services aggregator ---
let _logger: any;
function logger() { return _logger ??= getHostModule('logger').createLogger('log-service'); }

/**
 * Ambient services the host supplies to every action, alongside the services a
 * pack registers itself. Packs generate their `Services` type as
 * `typeof featureServices & HostServices`, so this stays the single definition
 * of what is injected.
 */
export interface HostServices {
  logger: Logger;
  emitter: {
    sendToPlugin: typeof sendToPlugin;
    sendToBrainSystem: typeof sendToBrainSystem;
    sendToSystem: typeof sendToSystem;
    onOutgoing: typeof onOutgoing;
    onIncoming: typeof onIncoming;
  };
  repository: typeof repository;
}

function resolveServices(): HostServices & Record<string, unknown> {
  return {
    logger: logger(),
    emitter: { sendToPlugin, sendToBrainSystem, sendToSystem, onOutgoing, onIncoming },
    repository,
    ...getRegisteredServices(),
  };
}

type Services = keyof ServiceRegistry extends never
  ? Record<string, any>
  : ServiceRegistry & Record<string, unknown>;

export const services: Services = new Proxy({} as any, {
  get(_, prop: string) { return resolveServices()[prop]; },
  ownKeys() { return Reflect.ownKeys(resolveServices()); },
  getOwnPropertyDescriptor(_, prop) {
    const s = resolveServices();
    if (prop in s) return { configurable: true, enumerable: true, value: (s as any)[prop] };
  },
});

// --- Thread teardown ---
const teardowns: ((threadId: string) => void)[] = [];

export function registerThreadTeardown(fn: (threadId: string) => void): void {
  teardowns.push(fn);
}

export function runThreadTeardown(threadId: string): void {
  for (const fn of teardowns) {
    try { fn(threadId); } catch { /* already gone */ }
  }
}
