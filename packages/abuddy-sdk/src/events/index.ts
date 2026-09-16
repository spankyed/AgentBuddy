// Messaging between frontend plugins and backend systems. Frontend-safe: no Node modules and no
// `services`, since pack frontends get this module from the host (the `sdkEvents` global).
import { getHostModule } from '../runtime/host.ts';
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

/** Whether `T` is a union of more than one type */
type IsUnion<T, U = T> = [T] extends [never] ? false : T extends unknown ? ([U] extends [T] ? false : true) : never;

/** The members of `E` whose `type` accepts `Type`: a literal, a union of literals or a template literal */
type EventsOfType<E, Type> = E extends { type: infer T } ? (Type extends T ? E : never) : never;

/** Each member of `E` without its `type`, keeping named fields beside an index signature (which `Omit` drops) */
type WithoutType<E> = E extends unknown ? { [K in keyof E as K extends 'type' ? never : K]: E[K] } : never;

/**
 * The fields an event must have for every event type in `Type`, a union: each type's fields, intersected. Checking
 * against one of them would let a send miss the fields of another.
 */
type FieldsOfEachType<E, Type> =
  (Type extends unknown ? (fields: WithoutType<EventsOfType<E, Type>>) => void : never) extends (fields: infer F) => void ? F : never;

/**
 * What a typed send accepts where no event can be checked: nothing. The required key names the mistake; `type`
 * stays so editors still complete the event type.
 */
type OneTarget<Why extends string, Type = unknown> = { type: Type; [field: string]: unknown } & { [K in Why]: never };

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
    | { type: 'APPLICATION_HOTKEYS'; hotkeys: ApplicationHotkeys }
    | { type: 'APPLICATION_RESTORE_LAST_PLUGIN'; lastActivePluginId: string }
    | { type: 'PLUGIN_VISIBILITY_UPDATED'; pluginVisibility: Record<string, boolean> };
};

/**
 * How events leave the process the code runs in. The api (over its root event bus), the renderer
 * (over its API client) and the test host each register one as the `event-transport` host module.
 * @internal
 */
export interface EventTransport {
  /** Delivers an event to a backend system */
  sendIncoming(event: IncomingSystemEvents): void;
  /** Delivers an event to a frontend plugin (backend only) */
  sendOutgoing(event: OutgoingSystemEvents): void;
  /** Calls `callback` each time a client connects (backend only) */
  onConnected(callback: () => void): () => void;
  /** Calls `callback` with each event sent to a backend system (backend only) */
  onIncoming(callback: (event: IncomingSystemEvents) => void): () => void;
}

let _transport: EventTransport | undefined;
function transport(): EventTransport {
  return _transport ??= getHostModule<EventTransport>('event-transport');
}

/**
 * Wraps an event for a plugin, for a system to send to the bus (`system.get(bus).send(emit(…))`).
 * Untyped: packs use the `emit` from their `#generated/events`.
 */
export function emit<P extends string, E extends { type: string }>(pluginId: P, event: E): { type: 'OUTGOING'; event: E & { pluginId: P } } {
  return { type: 'OUTGOING', event: { ...event, pluginId } };
}

/** Sends an event to a frontend plugin. Untyped: packs use the `sendToPlugin` from their `#generated/events`. */
export function sendToPlugin(pluginId: string, event: { type: string; [key: string]: unknown }): void {
  transport().sendOutgoing({ ...event, pluginId });
}

/** Sends an event to a backend system. Untyped: packs use the `sendToSystem` from their `#generated/events`. */
export function sendToSystem(systemId: string, event: { type: string; [key: string]: unknown }): void {
  transport().sendIncoming({ ...event, systemId });
}

/** Fires an event at every running flow, through the designated brain system */
export function sendToBrainSystem(event: { eventType: string; payload?: unknown; targetFlowId?: EARS.EntityId }): void {
  transport().sendIncoming({ ...event, type: 'TRIGGER_BRAIN_EVENT', systemId: getDesignated('brain') });
}

/** Calls `callback` each time a client connects; returns the unsubscribe (backend only) */
export function onConnected(callback: () => void): () => void {
  return transport().onConnected(callback);
}

/** Calls `callback` with each event sent to a backend system; returns the unsubscribe (backend only) */
export function onIncoming(callback: (event: IncomingSystemEvents) => void): () => void {
  return transport().onIncoming(callback);
}

/** The event a typed plugin send accepts: one of the plugin's events, for a single plugin id */
type PluginEvent<M extends PluginEvents, P extends keyof M> =
  IsUnion<P> extends true ? OneTarget<'send to one plugin id, not a union of them'> : M[P];

/** `emit` typed against a plugin event map. `pluginId` is one plugin, not a union of them. */
export type TypedEmit<M extends PluginEvents> = <P extends keyof M & string>(
  pluginId: P,
  event: PluginEvent<M, P>,
) => { type: 'OUTGOING'; event: M[P] & { pluginId: P } };

/** `sendToPlugin` typed against a plugin event map. `pluginId` is one plugin, not a union of them. */
export type TypedSendToPlugin<M extends PluginEvents> = <P extends keyof M & string>(pluginId: P, event: PluginEvent<M, P>) => void;

/**
 * `sendToSystem` typed against a system event map. The event is checked against the event its `type`
 * names, so a missing field is reported against that event. A `type` typed as a union needs the fields of
 * every event it names. `systemId` is one system, not a union: the event would be checked against one only.
 */
export type TypedSendToSystem<S extends SystemEventMap> = <
  Id extends keyof S & string,
  Type extends S[Id]['type'],
>(
  systemId: Id,
  event: IsUnion<Id> extends true
    ? OneTarget<'send to one system id, not a union of them', Type>
    : IsUnion<Type> extends true
      ? [FieldsOfEachType<S[Id], Type>] extends [never]
        ? OneTarget<'events of these types have conflicting fields: send one event type', Type>
        : { type: Type } & FieldsOfEachType<S[Id], Type>
      : { type: Type } & WithoutType<EventsOfType<S[Id], Type>>,
) => void;

export interface TypedEvents<P extends PluginEvents> {
  emit: TypedEmit<P>;
  sendToPlugin: TypedSendToPlugin<P>;
}

export interface TypedSystemEvents<P extends PluginEvents, S extends SystemEventMap> extends TypedEvents<P> {
  sendToSystem: TypedSendToSystem<S>;
}

/**
 * The sends of a pack, typed against its plugin and system event maps. `abuddy generate-entries` writes
 * `#generated/events` with it; the functions are the SDK's. `busIds` maps the pack's own feature ids to the
 * ids its systems run under (an external pack's are `<packId>.<featureId>`); other ids are sent as given.
 */
export function defineEvents<P extends PluginEvents>(): TypedEvents<P>;
export function defineEvents<P extends PluginEvents, S extends SystemEventMap>(busIds: Readonly<Record<string, string>>): TypedSystemEvents<P, S>;
export function defineEvents(busIds?: Readonly<Record<string, string>>): TypedEvents<PluginEvents> | TypedSystemEvents<PluginEvents, SystemEventMap> {
  const events = { emit, sendToPlugin } as unknown as TypedEvents<PluginEvents>;
  if (!busIds) return events;
  const send = (systemId: string, event: { type: string }) => sendToSystem(Object.prototype.hasOwnProperty.call(busIds, systemId) ? busIds[systemId] : systemId, event);
  return { ...events, sendToSystem: send as unknown as TypedSendToSystem<SystemEventMap> };
}
