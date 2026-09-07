import { getHostModule } from '../runtime/host';
import type { EARS, PluginEventRegistry, ServiceRegistry } from '../types/entities';

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

let _servicesMod: any;
function servicesMod() { if (!_servicesMod) _servicesMod = getHostModule('services'); return _servicesMod; }

type Services = keyof ServiceRegistry extends never
  ? Record<string, any>
  : ServiceRegistry & Record<string, unknown>;

export const services: Services = new Proxy({} as any, {
  get(_, prop: string) { return servicesMod()[prop]; },
});

const teardowns: ((threadId: string) => void)[] = [];

export function registerThreadTeardown(fn: (threadId: string) => void): void {
  teardowns.push(fn);
}

export function runThreadTeardown(threadId: string): void {
  for (const fn of teardowns) {
    try { fn(threadId); } catch { /* already gone */ }
  }
}
