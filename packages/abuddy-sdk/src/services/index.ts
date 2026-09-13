import { getHostModule } from '../runtime/host.js';
import { repository } from '../ears/index.js';
import { getRegisteredServices } from '../packs/index.js';
import type { EARS } from '../types/entities.js';
import { emit, type PluginEvents, type TypedEmit } from '../helpers/actor-helpers.js';
import type { Logger } from '../ears/runtime.js';

function lazyHost(name: string) {
  let m: any;
  return () => m ??= getHostModule(name);
}

// --- Event emitter (host-injected) ---
const emitter = lazyHost('event-emitter');

/** `sendToPlugin` typed against a plugin event map (see `#generated/events`). */
export type TypedSendToPlugin<M extends PluginEvents> = <P extends keyof M & string>(pluginId: P, event: M[P]) => void;

/** Any plugin, any event with a `type`. Packs use the typed one from `defineEvents` (their `#generated/events`). */
export function sendToPlugin(pluginId: string, event: { type: string; [key: string]: unknown }): void {
  emitter().sendToPlugin(pluginId, event);
}

export interface TypedEvents<M extends PluginEvents> {
  emit: TypedEmit<M>;
  sendToPlugin: TypedSendToPlugin<M>;
}

/**
 * `emit` and `sendToPlugin` typed against a pack's plugin event map. `abuddy generate-entries`
 * writes `#generated/events` with `defineEvents<PackEvents>()`; the functions are the SDK's.
 */
export function defineEvents<M extends PluginEvents>(): TypedEvents<M> {
  return { emit, sendToPlugin } as unknown as TypedEvents<M>;
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

/**
 * Host services plus every registered pack service. Untyped beyond HostServices: a pack's
 * `#generated/services` exports `services` typed with its own feature services.
 */
export const services: HostServices & Record<string, any> = new Proxy({} as any, {
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
