import { getHostModule } from '../runtime/host';
import { repository } from '../ears';
import { getRegisteredServices } from '../packs';
import type { EARS, PluginEventRegistry, ServiceRegistry } from '../types/entities';

// --- Event emitter (host-injected, depends on rootEvents) ---
let _emitterMod: any;
function emitterMod() { if (!_emitterMod) _emitterMod = getHostModule('event-emitter'); return _emitterMod; }

export function sendToPlugin<P extends keyof PluginEventRegistry & string>(
  pluginId: P, event: PluginEventRegistry[P]
): void;
export function sendToPlugin(pluginId: string, event: { type: string; [key: string]: any }): void;
export function sendToPlugin(pluginId: string, event: { type: string; [key: string]: any }): void {
  return emitterMod().sendToPlugin(pluginId, event);
}

export function sendToBrainSystem(event: {
  eventType: string;
  payload?: any;
  targetFlowId?: EARS.EntityId;
}): void {
  return emitterMod().sendToBrainSystem(event);
}

export function sendToSystem(systemId: string, event: { type: string; [key: string]: any }): void {
  return emitterMod().sendToSystem(systemId, event);
}

export function onOutgoing(callback: (event: any) => void): () => void {
  return emitterMod().onOutgoing(callback);
}

export function onIncoming(callback: (event: any) => void): () => void {
  return emitterMod().onIncoming(callback);
}

// --- Services aggregator (built from SDK-local + host-injected) ---
let _loggerMod: any;
function loggerMod() { if (!_loggerMod) _loggerMod = getHostModule('logger'); return _loggerMod; }

let _loggerService: any;
function loggerService() { if (!_loggerService) _loggerService = loggerMod().createLogger('log-service'); return _loggerService; }

function getServices(): Record<string, unknown> {
  return {
    logger: loggerService(),
    emitter: { sendToPlugin, sendToBrainSystem, sendToSystem, onOutgoing, onIncoming },
    repository,
    ...getRegisteredServices(),
  };
}

type Services = keyof ServiceRegistry extends never
  ? Record<string, any>
  : ServiceRegistry & Record<string, unknown>;

export const services: Services = new Proxy({} as any, {
  get(_, prop: string) { return getServices()[prop]; },
  ownKeys() { return Reflect.ownKeys(getServices()); },
  getOwnPropertyDescriptor(_, prop) {
    const s = getServices();
    if (prop in s) {
      return { configurable: true, enumerable: true, value: (s as any)[prop] };
    }
    return undefined;
  },
});

// --- Thread teardown (pure SDK, no host dependency) ---
const teardowns: ((threadId: string) => void)[] = [];

export function registerThreadTeardown(fn: (threadId: string) => void): void {
  teardowns.push(fn);
}

export function runThreadTeardown(threadId: string): void {
  for (const fn of teardowns) {
    try { fn(threadId); } catch { /* already gone */ }
  }
}
