// Messaging between frontend plugins and backend systems. Frontend-safe: no Node modules and no
// `services`, since pack frontends get this module from the host (the `sdkEvents` global).
import { boundHost, _isHostBound } from '../runtime/host-runtime.ts';
import { _isFeHostBound, boundFeHost } from '../runtime/fe-host.ts';
import { getDesignated } from '../designations/index.ts';
import { resolveName } from '../ids/addressing.ts';
import type { EARS } from '../types/entities.ts';
import type { ApplicationHotkeys } from '../types/index.ts';

/**
 * A message on the bus: the ref of the system or plugin it goes to, and the event exactly as the sender wrote it.
 * Where it goes is never a field of the event, so an event may carry any field (a `pluginId` of its own included).
 * Messages sent in (`sendToSystem`) go to systems, and messages sent out (`emit`, `sendToPlugin`) to plugins.
 */
export interface Message {
  to: string;
  event: { type: string; [key: string]: unknown };
}

/** Plugin id → the events that plugin receives. Each pack's `#generated/events` defines its `PackEvents`. */
export type PluginEvents = { [pluginId: string]: { type: string } };

/** System id → the events that system receives. Each pack's `#generated/events` defines its `PackSystemEvents`. */
export type SystemEventMap = { [systemId: string]: { type: string } };

/** Whether `T` is a union of several types */
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : false;

/** `Event` for one target and one event type; otherwise nothing is sendable, but `type` stays for completions */
type OneSend<Unions extends boolean, Type, Event> = true extends Unions ? { type: Type; 'send one event type to one target': never } : Event;

/** The members of `E` whose `type` (a literal, a union or a template literal) accepts `Type` */
type EventsOfType<E, Type> = E extends { type: infer T } ? (Type extends T ? E : never) : never;

/** Each member of `E` without `type`, keeping named fields beside an index signature (which `Omit` drops) */
type WithoutType<E> = E extends unknown ? { [K in keyof E as K extends 'type' ? never : K]: E[K] } : never;

/**
 * The events a system receives, from its spec (`defineSystem`) or its entry (a system module's default
 * export, declared with `satisfies SystemEntry` so the spec keeps its events).
 */
export type IncomingEventsOf<T> = T extends { _incoming: infer Incoming }
  ? Incoming
  : T extends { spec: { _incoming: infer Incoming } }
    ? Incoming
    : never;

/**
 * A system spec reduced to the events the system receives. Generated code declares each system's spec
 * with it, so the facade types dependents compile against carry no system context or internals.
 */
export function incomingEvents<S extends { _incoming: unknown }>(spec: S): { _incoming: S['_incoming'] } {
  return spec;
}

/**
 * Events the host app's own plugins receive from pack systems. A pack system declares a send to one
 * with `features[].system.sendsTo` in abuddy.json; `#generated/events` includes this map.
 */
export type HostPluginEvents = {
  'host/application':
    // The app's own send after each client connection (`ApplicationConnectedEvent`, @abuddy/host/bus): whether
    // the user onboarded, which plugins' tabs show, and the plugin the user last had open
    | { type: 'CLIENT_CONNECTED'; hasOnboarded: boolean; pluginVisibility: Record<string, boolean>; lastActivePlugin?: string }
    | { type: 'APPLICATION_HOTKEYS'; hotkeys: ApplicationHotkeys }
    // The app's own send when a plugin's tab is shown or hidden, or a pack's defaults change
    | { type: 'PLUGIN_VISIBILITY_UPDATED'; pluginVisibility: Record<string, boolean> };
};

type SameMembers<A extends string, B extends string> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * The event types each host plugin receives, as a value the app can check a send against and the build can
 * read the host's plugins from: a union of event shapes cannot be enumerated at runtime. A pack's own plugins
 * get this generated from their systems' declared unions; the host's are written here, and the check below
 * fails to compile when they drift from `HostPluginEvents`.
 */
export const HOST_PLUGIN_EVENT_TYPES = {
  'host/application': ['CLIENT_CONNECTED', 'APPLICATION_HOTKEYS', 'PLUGIN_VISIBILITY_UPDATED'],
} as const satisfies Record<keyof HostPluginEvents, readonly string[]>;

type TypeOfEvent<T> = T extends { type: infer K extends string } ? K : never;
const _hostPluginEventTypesMatch: {
  [K in keyof HostPluginEvents]: SameMembers<(typeof HOST_PLUGIN_EVENT_TYPES)[K][number], TypeOfEvent<HostPluginEvents[K]>>
} = { 'host/application': true };
void _hostPluginEventTypesMatch;

/**
 * Delivers an event to a backend system: in the renderer over its API client, elsewhere onto the bound app's bus.
 * A bound frontend wins, as it does for the registered packs' lookups (`_boundPackExtensions`).
 */
function sendIncoming(message: Message): void {
  if (_isFeHostBound()) boundFeHost().transport.sendIncoming(message);
  else if (_isHostBound()) boundHost().transport.rootEvents.emitIncoming(message);
  else throw new Error('No host is bound to send events through: call bindHost(runtime) (backend) or bindFeHost(runtime) (frontend) from @abuddy/sdk/runtime first');
}

/**
 * Wraps an event for a plugin, for a system to send to the bus (`system.get(bus).send(emit(…))`).
 * Untyped: packs use the `emit` from their `#generated/events`.
 */
export function emit<P extends string, E extends { type: string }>(to: P, event: E): { type: 'OUTGOING'; message: { to: P; event: E } } {
  return { type: 'OUTGOING', message: { to, event } };
}

/**
 * Sends an event to a frontend plugin through the bus, which delivers it once a client is connected (as `emit` in a
 * system). Backend only. Untyped: packs use the `sendToPlugin` from their `#generated/events`.
 */
export function sendToPlugin(to: string, event: { type: string; [key: string]: unknown }): void {
  boundHost().transport.rootEvents.emitPluginSend({ to, event });
}

/** Sends an event to a backend system. Untyped: packs use the `sendToSystem` from their `#generated/events`. */
export function sendToSystem(to: string, event: { type: string; [key: string]: unknown }): void {
  sendIncoming({ to, event });
}

/** Fires an event at every running flow, through the designated brain system */
export function sendToBrainSystem(event: { eventType: string; payload?: unknown; targetFlowId?: EARS.EntityId }): void {
  sendIncoming({ to: getDesignated('brain'), event: { ...event, type: 'TRIGGER_BRAIN_EVENT' } });
}

/** Calls `callback` each time a client connects; returns the unsubscribe (backend only) */
export function onConnected(callback: () => void): () => void {
  return boundHost().transport.rootEvents.onConnected(callback);
}

/** Calls `callback` with each message sent to a backend system; returns the unsubscribe (backend only) */
export function onIncoming(callback: (message: Message) => void): () => void {
  return boundHost().transport.rootEvents.onIncoming(callback);
}

/** `emit` typed against a plugin event map */
export type TypedEmit<M extends PluginEvents> = <P extends keyof M & string>(
  pluginId: P,
  event: OneSend<IsUnion<P>, M[P]['type'], M[P]>,
) => { type: 'OUTGOING'; message: { to: string; event: M[P] } };

/** `sendToPlugin` typed against a plugin event map */
export type TypedSendToPlugin<M extends PluginEvents> = <P extends keyof M & string>(
  pluginId: P,
  event: OneSend<IsUnion<P>, M[P]['type'], M[P]>,
) => void;

/** `sendToSystem` typed against a system event map; `type` picks the event, so a missing field names it */
export type TypedSendToSystem<S extends SystemEventMap> = <Id extends keyof S & string, Type extends S[Id]['type']>(
  systemId: Id,
  event: OneSend<IsUnion<Id> | IsUnion<Type>, Type, { type: Type } & WithoutType<EventsOfType<S[Id], Type>>>,
) => void;

/** A pack's typed sends */
export interface TypedEvents<P extends PluginEvents, S extends SystemEventMap> {
  emit: TypedEmit<P>;
  sendToPlugin: TypedSendToPlugin<P>;
  sendToSystem: TypedSendToSystem<S>;
}

/**
 * The sends `#generated/events` builds for pack `packId`. A pack names its own features by id and every other
 * feature, the host's included, as `<packId>/<featureId>` (`@abuddy/sdk/ids`). The types reject a name nothing declares, and the app reports a
 * send it has no receiver for.
 */
export function defineEvents<P extends PluginEvents, S extends SystemEventMap>(packId: string): TypedEvents<P, S> {
  const address = (name: string): string => resolveName(name, packId);
  return {
    emit: (name: string, event: { type: string }) => emit(address(name), event),
    sendToPlugin: (name: string, event: { type: string }) => sendToPlugin(address(name), event),
    sendToSystem: (name: string, event: { type: string }) => sendToSystem(address(name), event),
  } as unknown as TypedEvents<P, S>;
}
