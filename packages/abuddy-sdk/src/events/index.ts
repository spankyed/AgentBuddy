// Messaging between frontend plugins and backend systems. Frontend-safe: no Node modules and no
// `services`, since pack frontends get this module from the host (the `sdkEvents` global).
import { boundHost, _isHostBound } from '../runtime/host-runtime.ts';
import { _isFeHostBound, boundFeHost } from '../runtime/fe-host.ts';
import { getDesignated } from '../designations/index.ts';
import { resolveName } from '../ids/addressing.ts';
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

/**
 * What every plugin receives when its feature's settings change, so no pack declares it: the settings as they now
 * apply. The feature's system gets the same event, with the changes (`SystemEvents`).
 */
export type FeatureSettingsUpdated = { type: 'FEATURE_SETTINGS_UPDATED'; settings: unknown };

/** The event types every plugin receives from the app, beside those its pack's systems declare */
export const PLUGIN_EVENT_TYPES = ['FEATURE_SETTINGS_UPDATED'] as const satisfies readonly FeatureSettingsUpdated['type'][];

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

/** The events a system sends to plugins, from its spec or its entry, as `IncomingEventsOf` reads the ones it receives */
export type OutgoingEventsOf<T> = T extends { _outgoing: infer Outgoing }
  ? Outgoing
  : T extends { spec: { _outgoing: infer Outgoing } }
    ? Outgoing
    : never;

/**
 * A system spec reduced to the events the system receives and sends. Generated code declares each system's spec
 * with it, so the facade types dependents compile against carry no system context or internals.
 */
export function specEvents<S extends { id: string; _incoming: unknown; _outgoing: unknown }>(spec: S): { id: S['id']; _incoming: S['_incoming']; _outgoing: S['_outgoing'] } {
  return spec;
}

/**
 * A feature's system spec, whose `defineSystem` id must be the feature's: the system runs at the feature's ref and is
 * sent to by the feature id. Generated code passes each spec through it, so a spec defined under another id fails to
 * compile, and `abuddy build`'s type check of the pack's facade refuses the pack.
 */
export type SystemOfFeature<FeatureId extends string, Spec extends { id: FeatureId }> = Spec;

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

/** Events the host app's own systems receive from pack code, which names them `host/<feature>` */
export type HostSystemEvents = {
  // A pack whose data changed outside a pack change (its seeds imported) has the running systems read it again
  'host/bus': { type: 'PACK_CHANGED'; packId: string };
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
 * Sends an event to a frontend plugin through the bus, which delivers it once a client is connected (as `emit` in a
 * system). Backend only. Untyped: packs use the `sendToPlugin` from their `#generated/events`.
 */
export function sendToPlugin(to: string, event: { type: string; [key: string]: unknown }): void {
  boundHost().transport.rootEvents.emitPluginSend({ to, event });
}

/** A system: its ref, or the role a system plays (`{ role: 'brain' }`), found when the message is sent */
export type SystemTarget = string | { role: string };

/**
 * Sends an event to a backend system, by ref or by the role it plays. Untyped: packs use the `sendToSystem` from
 * their `#generated/events`, which takes names and checks the event against what the system declares.
 */
export function sendToSystem(to: SystemTarget, event: { type: string; [key: string]: unknown }): void {
  sendIncoming({ to: typeof to === 'string' ? to : getDesignated(to.role), event });
}

/** Calls `callback` each time a client connects; returns the unsubscribe (backend only) */
export function onConnected(callback: () => void): () => void {
  return boundHost().transport.rootEvents.onConnected(callback);
}

/** Calls `callback` with each message sent to a backend system; returns the unsubscribe (backend only) */
export function onIncoming(callback: (message: Message) => void): () => void {
  return boundHost().transport.rootEvents.onIncoming(callback);
}

/** `sendToPlugin` typed against a plugin event map */
export type TypedSendToPlugin<M extends PluginEvents> = <P extends keyof M & string>(
  pluginId: P,
  event: OneSend<IsUnion<P>, M[P]['type'], M[P]>,
) => void;

/**
 * `sendToSystem` typed against a system event map; `type` picks the event, so a missing field names it. A role
 * (`{ role: 'brain' }`) names whichever system plays it, which the build can't know, so its event is unchecked.
 */
export type TypedSendToSystem<S extends SystemEventMap> = (<Id extends keyof S & string, Type extends S[Id]['type']>(
  systemId: Id,
  event: OneSend<IsUnion<Id> | IsUnion<Type>, Type, { type: Type } & WithoutType<EventsOfType<S[Id], Type>>>,
) => void) & ((target: { role: string }, event: { type: string; [key: string]: unknown }) => void);

/** A pack's typed sends */
export interface TypedEvents<P extends PluginEvents, S extends SystemEventMap> {
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
    sendToPlugin: (name: string, event: { type: string }) => sendToPlugin(address(name), event),
    sendToSystem: (to: SystemTarget, event: { type: string }) => sendToSystem(typeof to === 'string' ? address(to) : to, event),
  } as unknown as TypedEvents<P, S>;
}
