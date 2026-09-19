// Messaging between frontend plugins and backend systems. Frontend-safe: no Node modules and no
// `services`, since pack frontends get this module from the host (the `sdkEvents` global).
import { boundHost, _isHostBound } from '../runtime/host-runtime.ts';
import { _isFeHostBound, boundFeHost } from '../runtime/fe-host.ts';
import { getDesignated } from '../designations/index.ts';
import type { EARS } from '../types/entities.ts';
import type { ApplicationHotkeys } from '../types/index.ts';

/** An event for a backend system, as the bus receives it */
export type IncomingSystemEvents = { type: string; systemId: string; [key: string]: unknown };

/** An event for a frontend plugin, as the bus sends it */
export type OutgoingSystemEvents = { type: string; pluginId: string; [key: string]: unknown };

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
  application:
    // The app's own send after each client connection (`ApplicationConnectedEvent`, @abuddy/host/bus)
    | { type: 'CLIENT_CONNECTED'; hasOnboarded: boolean }
    | { type: 'APPLICATION_HOTKEYS'; hotkeys: ApplicationHotkeys }
    | { type: 'APPLICATION_RESTORE_LAST_PLUGIN'; lastActivePluginId: string }
    | { type: 'PLUGIN_VISIBILITY_UPDATED'; pluginVisibility: Record<string, boolean> };
};

/**
 * The host plugins a pack's system may name in `sendsTo`, as a value the build can read — the keys of
 * `HostPluginEvents`, which a type cannot be enumerated into at runtime. The check below fails to
 * compile if the two ever disagree, so adding a host plugin to one without the other is not possible.
 */
export const HOST_PLUGIN_IDS = ['application'] as const;

type SameMembers<A extends string, B extends string> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _hostPluginIdsMatchEvents: SameMembers<(typeof HOST_PLUGIN_IDS)[number], keyof HostPluginEvents> = true;
void _hostPluginIdsMatchEvents;

/**
 * The event types each host plugin receives, as a value the app can check a send against — the same
 * problem `HOST_PLUGIN_IDS` solves, one level down: a union of event shapes cannot be enumerated at
 * runtime. A pack's own plugins get this generated from their systems' declared unions; the host's are
 * written here, and the check below fails to compile when they drift from `HostPluginEvents`.
 */
export const HOST_PLUGIN_EVENT_TYPES = {
  application: ['CLIENT_CONNECTED', 'APPLICATION_HOTKEYS', 'APPLICATION_RESTORE_LAST_PLUGIN', 'PLUGIN_VISIBILITY_UPDATED'],
} as const satisfies Record<keyof HostPluginEvents, readonly string[]>;

type TypeOfEvent<T> = T extends { type: infer K extends string } ? K : never;
const _hostPluginEventTypesMatch: {
  [K in keyof HostPluginEvents]: SameMembers<(typeof HOST_PLUGIN_EVENT_TYPES)[K][number], TypeOfEvent<HostPluginEvents[K]>>
} = { application: true };
void _hostPluginEventTypesMatch;

/**
 * Delivers an event to a backend system: in the renderer over its API client, elsewhere onto the bound app's bus.
 * A bound frontend wins, as it does for the registered packs' lookups (`_boundPackExtensions`).
 */
function sendIncoming(event: IncomingSystemEvents): void {
  if (_isFeHostBound()) boundFeHost().transport.sendIncoming(event);
  else if (_isHostBound()) boundHost().transport.rootEvents.emitIncoming(event);
  else throw new Error('No host is bound to send events through: call bindHost(runtime) (backend) or bindFeHost(runtime) (frontend) from @abuddy/sdk/runtime first');
}

/**
 * Wraps an event for a plugin, for a system to send to the bus (`system.get(bus).send(emit(…))`).
 * Untyped: packs use the `emit` from their `#generated/events`.
 */
export function emit<P extends string, E extends { type: string }>(pluginId: P, event: E): { type: 'OUTGOING'; event: E & { pluginId: P } } {
  return { type: 'OUTGOING', event: { ...event, pluginId } };
}

/**
 * Sends an event to a frontend plugin through the bus, which delivers it once a client is connected (as `emit` in a
 * system). Backend only. Untyped: packs use the `sendToPlugin` from their `#generated/events`.
 */
export function sendToPlugin(pluginId: string, event: { type: string; [key: string]: unknown }): void {
  boundHost().transport.rootEvents.emitPluginSend({ ...event, pluginId });
}

/** Sends an event to a backend system. Untyped: packs use the `sendToSystem` from their `#generated/events`. */
export function sendToSystem(systemId: string, event: { type: string; [key: string]: unknown }): void {
  sendIncoming({ ...event, systemId });
}

/** Fires an event at every running flow, through the designated brain system */
export function sendToBrainSystem(event: { eventType: string; payload?: unknown; targetFlowId?: EARS.EntityId }): void {
  sendIncoming({ ...event, type: 'TRIGGER_BRAIN_EVENT', systemId: getDesignated('brain') });
}

/** Calls `callback` each time a client connects; returns the unsubscribe (backend only) */
export function onConnected(callback: () => void): () => void {
  return boundHost().transport.rootEvents.onConnected(callback);
}

/** Calls `callback` with each event sent to a backend system; returns the unsubscribe (backend only) */
export function onIncoming(callback: (event: IncomingSystemEvents) => void): () => void {
  return boundHost().transport.rootEvents.onIncoming(callback);
}

/** `emit` typed against a plugin event map */
export type TypedEmit<M extends PluginEvents> = <P extends keyof M & string>(
  pluginId: P,
  event: OneSend<IsUnion<P>, M[P]['type'], M[P]>,
) => { type: 'OUTGOING'; event: M[P] & { pluginId: P } };

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
 * The sends `#generated/events` builds. `systemIds` maps each name the pack sends to (its own feature ids and
 * `<dependency>/<feature>`) to the id that system runs under.
 */
export function defineEvents<P extends PluginEvents, S extends SystemEventMap>(systemIds: Readonly<Record<string, string>>): TypedEvents<P, S> {
  const send = (name: string, event: { type: string }) => {
    if (!Object.prototype.hasOwnProperty.call(systemIds, name)) {
      throw new Error(`No system is named "${name}": send to one of this pack's features, or a dependency's as "<dependency>/<feature>"`);
    }
    sendToSystem(systemIds[name], event);
  };
  return { emit, sendToPlugin, sendToSystem: send } as unknown as TypedEvents<P, S>;
}
