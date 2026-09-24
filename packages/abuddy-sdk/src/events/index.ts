// Messaging between frontend plugins and backend systems. Frontend-safe: no Node modules and no
// `services`, since pack frontends get this module from the host (the `sdkEvents` global).
import { boundHost, _isHostBound } from '../runtime/host-runtime.ts';
import { _isFeHostBound, boundFeHost } from '../runtime/fe-host.ts';
import { getDesignated } from '../designations/index.ts';
import { resolveName, splitRef, type FeatureRef } from '../ids/refs.ts';
import type { ApplicationHotkeys } from '../types/index.ts';
import { eventTypes } from './event-types.ts';
import type { ContractIncoming, SystemEvents } from '../framework/define-system.ts';

export { eventTypes, type TypeOfEvent } from './event-types.ts';

/**
 * A message on the bus: the ref of the system or plugin it goes to, and the event exactly as the sender wrote it.
 * Where it goes is never a field of the event, so an event may carry any field (a `pluginId` of its own included).
 * Messages sent in (`sendToSystem`) go to systems, and messages sent out (`broadcastToPlugin`) to plugins.
 */
export interface Message {
  to: string;
  event: { type: string; [key: string]: unknown };
  /**
   * The id of the pack that sent it, stamped by the sends `#generated/events` builds (`defineEvents`), which is
   * the only place a sender's identity is in scope. Diagnostics name it: a dropped or unroutable message says who
   * sent it instead of leaving that to a grep.
   *
   * Absent on a send the host makes for itself and on one an action makes through `services.emitter`, which runs
   * outside any pack. Nothing routes or refuses on it — treat it as a label, not a claim: a sender that doesn't
   * stamp is not thereby untrusted, and one that does has not been checked.
   */
  from?: string;
}

/** A plugin's name → the events that plugin receives. Each pack's `#generated/events` defines its `SendablePluginEvents`. */
export type PluginEvents = { [plugin: string]: { type: string } };

/**
 * What every plugin receives when its feature's settings change, so no pack declares it: the settings as they now
 * apply. The feature's system gets the same event, with the changes (`SystemEvents`).
 */
export type FeatureSettingsUpdated = { type: 'FEATURE_SETTINGS_UPDATED'; settings: unknown };

/** The event types every plugin receives from the app, beside those its pack's systems declare */
export const PLUGIN_EVENT_TYPES = eventTypes<FeatureSettingsUpdated>()('FEATURE_SETTINGS_UPDATED');

/** `M` keyed `<PackId>/<key>`: a pack's features by their refs */
export type Qualified<PackId extends string, M> = { [K in keyof M & string as `${PackId}/${K}`]: M[K] };

/**
 * `M`, keyed by refs, as pack `PackId`'s code names its keys: its own features by feature id (their refs are for
 * other packs), every other feature by ref
 */
export type WithOwnNames<PackId extends string, M> = {
  [K in keyof M & string as K extends `${PackId}/${infer FeatureId}` ? FeatureId : K]: M[K]
};

/** A system's name → the events that system receives. Each pack's `#generated/events` defines its `PackSystemEvents`. */
export type SystemEventMap = { [system: string]: { type: string } };

/** Whether `T` is a union of several types */
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : false;

/** `Event` for one target and one event type; otherwise nothing is sendable, but `type` stays for completions */
type OneSend<Unions extends boolean, Type, Event> = true extends Unions ? { type: Type; 'send one event type to one target': never } : Event;

/** The members of `E` whose `type` (a literal, a union or a template literal) accepts `Type` */
type EventsOfType<E, Type> = E extends { type: infer T } ? (Type extends T ? E : never) : never;

/** Each member of `E` without `type`, keeping named fields beside an index signature (which `Omit` drops) */
type WithoutType<E> = E extends unknown ? { [K in keyof E as K extends 'type' ? never : K]: E[K] } : never;

/**
 * The events a system receives, from its feature's `Contract` — what a sender may write. Its `internal` half isn't
 * here: those are what the system's own children send it, and no other feature's to send.
 */
export type IncomingEventsOf<C> = ContractIncoming<C>;

/** The events a system sends to plugins, from its feature's `Contract` */
export type OutgoingEventsOf<C> = C extends { outgoing: infer Events } ? Events : never;

/**
 * Every event a plugin's `Contract` says another plugin may send it, across audiences. Generated code builds each
 * plugin's inbox with it, as it builds a system's with `OutgoingEventsOf`. A contract with no `inbox` publishes
 * state only and receives nothing but its own system's events.
 */
export type PluginInboxOf<C> = C extends { inbox: infer Audiences }
  ? Extract<Audiences[keyof Audiences], { type: string }>
  : never;

/**
 * The half of a plugin's inbox a *dependent pack* may send: its `public` audience alone. The `pack` audience is
 * what this pack's own features send it — a sibling asking for a panel, a link opening a note — and publishing it
 * would make every dependent's completions carry commands only the owning pack can meaningfully send.
 *
 * Generated code builds `PackPluginEvents` with this and `OwnPluginEvents` with `PluginInboxOf`, which is the
 * whole of the split: one contract, two readers.
 */
export type PublicPluginInboxOf<C> = C extends { inbox: { public: infer Events } }
  ? Extract<Events, { type: string }>
  : never;

/**
 * Events the host app's own plugins receive from packs. The host declares them here, as a pack's plugin declares
 * its own in its `Contract`; `#generated/events` includes this map, so any pack may send them.
 */
export type HostPluginEvents = {
  'host/application':
    // The app's own send after each client connection (`ApplicationConnectedEvent`, @abuddy/host/bus): whether
    // the user onboarded, which plugins' tabs show, and the plugin the user last had open
    | { type: 'CLIENT_CONNECTED'; hasOnboarded: boolean; pluginVisibility: Record<string, boolean>; lastActivePlugin?: string }
    | { type: 'APPLICATION_HOTKEYS'; hotkeys: ApplicationHotkeys }
    // The app's own send when a plugin's tab is shown or hidden, or a pack's defaults change
    | { type: 'PLUGIN_VISIBILITY_UPDATED'; pluginVisibility: Record<string, boolean> }
    // The user finished onboarding: the shell leaves its onboarding layout
    | { type: 'ONBOARDING_COMPLETE' }
    // Opens a plugin, by its ref, in the app's main windows (a popout keeps the plugin it shows) and hands its actor
    // `events`; the shell waits for a plugin whose pack's frontend is still loading
    | { type: 'OPEN_PLUGIN'; plugin: string; events?: Array<{ type: string; [key: string]: unknown }> };
  /**
   * The app's Settings view. A pack sends it what only that pack can find out about its own things, for the view to
   * show — the code feature's CLI resolution, for one. The settings themselves are the app's.
   */
  'host/settings':
    | { type: 'CLI_TEST_RESULT'; provider: string; success: boolean; error?: string; resolvedPath?: string };
};

/** Events the host app's own systems receive from pack code, which names them `host/<feature>` */
export type HostSystemEvents = {
  // A pack whose data changed outside a pack change (its seeds imported) has the running systems read it again
  'host/bus': { type: 'PACK_CHANGED'; packId: string };
};

/**
 * The event types the host's systems accept from pack code, which the app checks a client's send against as it checks
 * a pack system's: from a frontend as from a backend
 */
export const HOST_SYSTEM_EVENT_TYPES = {
  'host/bus': eventTypes<HostSystemEvents['host/bus']>()('PACK_CHANGED'),
} satisfies Record<keyof HostSystemEvents, readonly string[]>;

/**
 * The event types each host plugin receives, as a value the app can check a send against and the build can
 * read the host's plugins from. A pack's own plugins get this generated from their systems' specs.
 */
export const HOST_PLUGIN_EVENT_TYPES = {
  'host/application': eventTypes<HostPluginEvents['host/application']>()('CLIENT_CONNECTED', 'APPLICATION_HOTKEYS', 'PLUGIN_VISIBILITY_UPDATED', 'ONBOARDING_COMPLETE', 'OPEN_PLUGIN'),
  'host/settings': eventTypes<HostPluginEvents['host/settings']>()('CLI_TEST_RESULT'),
} satisfies Record<keyof HostPluginEvents, readonly string[]>;

/**
 * Delivers an event to a backend system: in the renderer over its API client, elsewhere onto the bound app's bus.
 * A bound frontend wins, as it does for the registered packs' lookups (`_boundPackExtensions`).
 */
function sendIncoming(message: Message): void {
  if (_isFeHostBound()) boundFeHost().client.send(message);
  else if (_isHostBound()) boundHost().transport.rootEvents.emitIncoming(message);
  else throw new Error('No host is bound to send events through: call bindHost(runtime) (backend) or bindFeHost(runtime) (frontend) from @abuddy/sdk/runtime first');
}

/**
 * Sends an event to a plugin through the bus, which delivers it once a client is connected — and to **every**
 * window showing that plugin, since a plugin runs once per window. Backend only.
 *
 * That reach is the reason for the name. `sendToPlugin` beside it is the renderer's, and goes to one window's actor.
 * A backend send that only one window should act on says so in the event, as the host's `OPEN_PLUGIN` does.
 *
 * Untyped: packs use the `broadcastToPlugin` from their `#generated/events`.
 */
export function untypedBroadcastToPlugin(to: string, event: { type: string; [key: string]: unknown }, from?: string): void {
  // The two sends share a signature, so the compiler can't tell a caller it picked the wrong one: say which it is.
  // Reaching for the other from here is the likely mistake, not a missing bindHost.
  if (!_isHostBound() && _isFeHostBound()) {
    throw new Error(`broadcastToPlugin("${to}") is the backend's, over the bus to every window. In the renderer, send to this window's plugin with sendToPlugin from #generated/events`);
  }
  boundHost().transport.rootEvents.emitPluginSend({ to, event, from });
}

/**
 * @internal Sends an event to the plugin at `ref` in **this window**, through the shell — no bus, no other window.
 * The renderer half of `sendToPlugin`, which `defineEvents` types per receiving plugin.
 *
 * A plugin runs once per window, so this is what UI coordination wants: the artifact opens where the user clicked.
 *
 * It goes through the shell rather than to the actor directly, because "is that plugin here yet" is the shell's
 * question and it already answers it for `OPEN_PLUGIN`: a plugin whose pack's frontend is still loading is waited
 * for, and one no pack provides is reported to the user once loading settles. Reaching past the shell meant two
 * owners of that question giving different answers — this one threw. It is a send, not a navigation, so the plugin
 * the user has open doesn't change.
 */
export function _sendToLocalPlugin(ref: string, event: { type: string; [key: string]: unknown }, from?: string): void {
  // The two sends share a signature, so the compiler can't tell a caller it picked the wrong one: say which it is.
  if (!_isFeHostBound() && _isHostBound()) {
    throw new Error(`sendToPlugin("${ref}") is the renderer's, to this window's plugin. On the backend, send over the bus with broadcastToPlugin from #generated/events`);
  }
  if (!splitRef(ref)) throw new Error(`"${ref}" doesn't name a plugin: a plugin is named "<packId>/<featureId>"`);
  boundFeHost().application.send({ type: 'SEND_TO_PLUGIN', plugin: ref, events: [event], from });
}

/** A system: its ref, or the role a system plays (`{ role: 'brain' }`), found when the message is sent */
export type SystemTarget = string | { role: string };

/**
 * Sends an event to a backend system, by ref or by the role it plays. Untyped: packs use the `sendToSystem` from
 * their `#generated/events`, which takes names and checks the event against what the system declares.
 */
export function untypedSendToSystem(to: SystemTarget, event: { type: string; [key: string]: unknown }, from?: string): void {
  sendIncoming({ to: typeof to === 'string' ? to : getDesignated(to.role), event, from });
}

/** Calls `callback` each time a client connects; returns the unsubscribe (backend only) */
export function onConnected(callback: () => void): () => void {
  return boundHost().transport.rootEvents.onConnected(callback);
}

/** Calls `callback` with each message sent to a backend system; returns the unsubscribe (backend only) */
export function onIncoming(callback: (message: Message) => void): () => void {
  return boundHost().transport.rootEvents.onIncoming(callback);
}

/** `sendToPlugin` typed against a plugin event map; any feature's plugin, by its ref, takes what every plugin does */
export type TypedSendToPlugin<M extends PluginEvents> = (<P extends keyof M & string>(
  plugin: P,
  event: OneSend<IsUnion<P>, M[P]['type'], M[P]>,
) => void) & ((plugin: FeatureRef, event: FeatureSettingsUpdated) => void);

/**
 * `sendToSystem` typed against a system event map; `type` picks the event, so a missing field names it. A role
 * (`{ role: 'brain' }`) names whichever system plays it, which the build can't know, so its event is unchecked. Any
 * feature's system, named by its ref, takes the events every system does (`SystemEvents`).
 */
export type TypedSendToSystem<S extends SystemEventMap> = (<Id extends keyof S & string, Type extends S[Id]['type']>(
  system: Id,
  event: OneSend<IsUnion<Id> | IsUnion<Type>, Type, { type: Type } & WithoutType<EventsOfType<S[Id], Type>>>,
) => void) & ((target: { role: string }, event: { type: string; [key: string]: unknown }) => void) & ((system: FeatureRef, event: SystemEvents) => void);

/** A pack's typed sends */
export interface TypedEvents<P extends PluginEvents, S extends SystemEventMap> {
  /** Backend: over the bus, to every window showing that plugin */
  broadcastToPlugin: TypedSendToPlugin<P>;
  /** Renderer: straight to this window's actor for that plugin */
  sendToPlugin: TypedSendToPlugin<P>;
  sendToSystem: TypedSendToSystem<S>;
}

/**
 * The sends `#generated/events` builds for pack `packId`. A pack names its own features by id and every other
 * feature, the host's included, as `<packId>/<featureId>` (`@abuddy/sdk/ids`). The types reject a name nothing declares, and the app reports a
 * send it has no receiver for.
 */
export function defineEvents<P extends PluginEvents, S extends SystemEventMap>(packId: string): TypedEvents<P, S> {
  const refOf = (name: string): string => resolveName(name, packId);
  return {
    broadcastToPlugin: (name: string, event: { type: string }) => untypedBroadcastToPlugin(refOf(name), event, packId),
    sendToPlugin: (name: string, event: { type: string }) => _sendToLocalPlugin(refOf(name), event, packId),
    sendToSystem: (to: SystemTarget, event: { type: string }) => untypedSendToSystem(typeof to === 'string' ? refOf(to) : to, event, packId),
  } as unknown as TypedEvents<P, S>;
}
