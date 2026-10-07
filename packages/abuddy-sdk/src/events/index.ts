// Messaging between frontend plugins and backend systems. Frontend-safe: no Node modules and no
// `services`, since pack frontends get this module from the host (the `sdkEvents` global).
import { boundHost, _isHostBound } from '../runtime/host-runtime.ts';
import { _isFeHostBound, boundFeHost } from '../runtime/fe-host.ts';
import { getDesignated } from '../designations/index.ts';
import { resolveName, splitRef, type FeatureRef } from '../ids/refs.ts';
import type { ApplicationHotkeys } from '../types/index.ts';
import { eventTypes } from './event-types.ts';
import { _currentDelivery, type _Delivery } from './delivery.ts';
import type { ContractIncoming, ContractOutgoing, SystemEvents } from '../framework/define-system.ts';

export { eventTypes, type TypeOfEvent } from './event-types.ts';
export { _currentDelivery, _runDelivery, type _Delivery, type _Asker } from './delivery.ts';

/**
 * A message on the bus: the ref of the system or plugin it goes to, and the event exactly as the sender wrote it.
 * Where it goes is never a field of the event, so an event may carry any field (a `pluginId` of its own included).
 * Messages sent in (`sendToSystem`) go to systems, and messages sent out (`broadcastToPlugin`) to plugins.
 */
export interface Message {
  to: string;
  event: { type: string; [key: string]: unknown };
  /**
   * The id of the pack that sent it, stamped by the sends `#generated/events` builds (`defineEvents`) and by the
   * emitter an action runs with (`createActionEmitter`). Diagnostics name it: a dropped or unroutable message says
   * who sent it instead of leaving that to a grep.
   *
   * Absent on a send made for no pack in particular — `reportError`'s, which sends on behalf of whoever called it
   * and is told a source rather than a pack. Nothing routes or refuses on it — treat it as a label, not a claim:
   * a sender that doesn't stamp is not thereby untrusted, and one that does has not been checked.
   */
  from?: string;
  /**
   * What within the sender made it, where the sender has a name for that: `action:<label>` for an action, and for
   * a `reportError` the source it was given (`'bus'`, `'step-runtime'`). Each is the string that also names the
   * corresponding logger, so a dropped send and the log lines around it are one grep apart.
   *
   * An action is why this exists. It is the one sender a pack cannot point at in its own source — content a user
   * writes, edits and exports — so `from` naming its pack leaves the useful half of "who sent this" unsaid. `from`
   * keeps one meaning, the pack; `'<pack>/<action>'` would read as a `<packId>/<featureId>` ref and give anything
   * parsing it a confident wrong answer.
   *
   * Between the two, every send carries a pack, a source, or both — except `services.emitter` reached outside an
   * action, where neither is in scope. A label like `from`: nothing routes or refuses on it.
   */
  via?: string;
  /**
   * Which connection to deliver to, where the message is for one rather than all of them. Absent means every
   * connection, which is what a notification wants and what a backend send has always done.
   *
   * Unlike `from` and `via`, this one routes — so it is never read from the wire. The API mints it per
   * WebSocket connection and stamps it on the way in (`createContext`, `packages/api/src/transport/context.ts`),
   * which is what makes it a return address a sender cannot forge. A client that puts a `client` on a send has
   * it dropped at the boundary, like any other field the input schema does not name.
   *
   * **A reload ends the connection, and an answer in flight for it is dropped.** The id is per connection, so a
   * window that reloads mid-request is a different one and the subscription filters the reply out — where the
   * old broadcast would have reached it. That is the trade an addressed answer makes, and the app already has
   * the primitive for it: a view that asks for data asks again on `CLIENT_CONNECTED`.
   */
  client?: string;
  /**
   * The ref of the participant that sent it: a feature's system or plugin, or a participant that claimed a name
   * (`host/drive`). What `reply` answers, so a handler never has to be told who asked.
   *
   * Stamped where a send is *made*, which is during the handling of another message — `createSends` reads it from
   * the delivery in scope (`_currentDelivery`). It cannot be stamped from the sender's own identity, because a
   * pack's generated sends know their pack and not which of its features called them.
   *
   * Distinct from `from`, which names the pack: two features of one pack are one `from` and two `sender`s. Note
   * that `MessageSender` is `Pick<Message, 'from' | 'via'>` and so does **not** include this — it is the type of
   * the sender *labels*, which say who to blame in a diagnostic, where this says where to send an answer.
   *
   * A client may set it, unlike `client`, and the API's `bus.send` checks that it names something addressable —
   * not that the caller is it. So this is an **address, not an authenticated identity**: a handler that branches
   * on it is taking the sender's word. What bounds that word is `client`, since a reply goes to the connection
   * the ask arrived on, so the most a forged one buys is making a system answer *you* while believing it
   * answered somebody else. `bus.send` has the rest, including what closing it properly would take.
   */
  sender?: string;
  /**
   * That this message is an answer to one somebody sent — set by `_replyTo` and by nothing else, so a reader can
   * treat it as "a `reply` built this" rather than a hint.
   *
   * `true` or absent, never `false`: there is no "not answering" value and nobody should be computing one.
   *
   * It exists because an undeliverable answer is not the same event as an undeliverable command. A command was
   * given by someone who is still there to be told it failed; an answer has no user behind it, and the asker may
   * simply be gone — a pack unloading mid-request is a race, not a mistake. So the renderer's wire send keeps the
   * log and drops the toast for one of these (`renderer/src/transport/client.ts`), and the bus's two drop
   * diagnostics name `reply` as the verb rather than the one the caller did not call.
   *
   * **Local to each side, and deliberately not on the wire.** `bus.send`'s input schema does not name it, so a
   * client's copy is dropped at the boundary like any other unnamed field — and nothing is lost, because every
   * reader is either in the window that built the message or on the backend that built it. A window answering a
   * backend system is refused by `receiveClientEvent` against the same validation map the bus would use, before
   * the bus sees it, so there is no backend reader for a wire-borne one to reach.
   */
  answering?: true;
}

/**
 * How a diagnostic names who sent a message, as a suffix to append: ` by "default-setup" (action:summarise)`,
 * or `''` when the message says neither. Every place that reports an undeliverable message appends this, so they
 * word it the same and a field added to the sender reaches all of them at once. It says nothing about whether a
 * sender may send: nothing routes on either field, and a drop that names no sender just has one fewer clue.
 */
export function senderSuffix({ from, via }: Pick<Message, 'from' | 'via'>): string {
  if (from && via) return ` by "${from}" (${via})`;
  if (from) return ` by "${from}"`;
  if (via) return ` by ${via}`;
  return '';
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

/*
 * The `*Of` names below, with `PluginStateOf` (`fe/plugin.ts`), are the vocabulary generated code is written in:
 * `generate-entries` emits them into every pack's `#generated/events`. That is what they are for, and why a system
 * contract's two published halves get one each even though `ContractIncoming` and `ContractOutgoing` already read
 * those fields — the layer that packs depend on stays a surface this package can keep still while the readers
 * under it change. They span both contract kinds, where `Contract*` covers `SystemContract` alone.
 */

/**
 * The events a system receives, from its feature's `Contract` — what a sender may write. Its `internal` half isn't
 * here: those are what the system's own children send it, and no other feature's to send.
 */
export type IncomingEventsOf<C> = ContractIncoming<C>;

/** The events a system sends to plugins, from its feature's `Contract` */
export type OutgoingEventsOf<C> = ContractOutgoing<C>;

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
 * Delivers an event to a plugin in **this window**, through the shell. The window-local counterpart of
 * `sendIncoming`: no bus, no other window, and the two are the only channels a window has.
 *
 * It takes the whole message rather than reading the sender from the delivery in scope, because `reply` is
 * bound at entry and may be called long after its delivery has returned — the one caller that cannot rely on
 * ambient scope is the one that most needs the address to arrive.
 *
 * Through the shell rather than at the actor, because "is that plugin here yet" is the shell's question and it
 * already answers it for `OPEN_PLUGIN`: a plugin whose pack's frontend is still loading is waited for, and one
 * no pack provides is reported to the user once loading settles.
 */
function deliverInWindow(message: Message): void {
  const ref = message.to;
  if (!splitRef(ref)) throw new Error(`"${ref}" doesn't name a plugin: a plugin is named "<packId>/<featureId>"`);
  const { from, via, sender, answering } = message;
  boundFeHost().application.send({
    type: 'SEND_TO_PLUGIN',
    plugin: ref,
    events: [message.event],
    ...(from ? { from } : {}),
    ...(via ? { via } : {}),
    // Whether a person is waiting on this, which decides how the shell reports a plugin that isn't there: a
    // command someone gave is worth a toast, an answer to a question is not. It rides on the envelope, so this
    // door and the renderer's wire send read one field rather than each being told separately
    ...(answering ? { answering } : {}),
    // The window's counterpart of the bus's `askerOf`: each door turns the envelope's `sender` into the channel
    // it arrived on, because that door is the only place the channel is known. This one stays inside the window,
    // so a plugin answering it answers an actor beside it rather than something over the bus.
    ...(sender ? { asker: { kind: 'window', ref: sender } as const } : {}),
  });
}

/** What binds a set of sends: how a name becomes a ref, and the pack making them. */
export interface SendBinding {
  /** A name the caller writes → the ref it stands for. The unbound sends take refs already, so a name is its own ref. */
  resolve?: (name: string) => string;
  /**
   * The pack these sends are made by, stamped on every message as `Message.from`. Absent where there is no pack to
   * name: `reportError` sends for a caller that is a logger source, and binds only `via`.
   */
  from?: string;
  /**
   * What within the sender is making them, stamped as `Message.via`: `action:<label>` for the emitter an action
   * runs with (`createActionEmitter`), and its source for `reportError`, which has no pack to name.
   */
  via?: string;
}

/**
 * The three sends, bound to whoever is making them. One place builds a send, so what travels beside the event —
 * `from` today — is threaded here rather than added as a parameter to each of them, and to every caller that
 * has nothing to pass.
 */
export function createSends({ resolve = (name: string) => name, from, via }: SendBinding = {}) {
  // Only the fields this binding has. An envelope carrying `from: undefined` reads as a sender that was there and
  // got lost, and adds a key to every log line and every message that crosses the wire.
  const labels = { ...(from ? { from } : {}), ...(via ? { via } : {}) };
  // Where an answer to this send would go. A send is almost always made while handling another message, and the
  // handler's own ref is the address — read from the delivery rather than from the binding, which knows the pack
  // and not which feature called it. Absent outside a delivery (host plumbing, a timer), and `reply` says so
  // rather than guessing.
  const answerAddress = () => {
    const receiver = _currentDelivery()?.receiver;
    return receiver ? { sender: receiver } : {};
  };

  return {
    broadcastToPlugin(name: string, event: { type: string; [key: string]: unknown }): void {
      // The two sends share a signature, so the compiler can't tell a caller it picked the wrong one: say which it
      // is. Reaching for the other from here is the likely mistake, not a missing bindHost.
      if (!_isHostBound() && _isFeHostBound()) {
        throw new Error(`broadcastToPlugin("${name}") is the backend's, over the bus to every window. In the renderer, send to this window's plugin with sendToPlugin from #generated/events`);
      }
      boundHost().transport.rootEvents.emitPluginSend({ to: resolve(name), event, ...labels, ...answerAddress() });
    },

    sendToPlugin(name: string, event: { type: string; [key: string]: unknown }): void {
      // The two sends share a signature, so the compiler can't tell a caller it picked the wrong one: say which it is.
      if (!_isFeHostBound() && _isHostBound()) {
        throw new Error(`sendToPlugin("${name}") is the renderer's, to this window's plugin. On the backend, send over the bus with broadcastToPlugin from #generated/events`);
      }
      deliverInWindow({ to: resolve(name), event, ...labels, ...answerAddress() });
    },

    /**
     * Sends an event to a plugin on **one connection** — the window a handler is serving — rather than to
     * every window showing it.
     *
     * The pair with `broadcastToPlugin` is the whole point, and which to reach for follows the job: news
     * every window needs is a broadcast, and anything only the window that asked should act on is this.
     * Before it existed a system could be *answered* by a window but could only *ask* by broadcasting, so
     * one question collected one answer per open window.
     *
     * **The connection is a parameter, not something this finds.** A handler is handed the one it is
     * serving (`client`, beside `reply`), so the address survives an `await` or being stored for later —
     * which is the same reason `reply` is handed rather than read from the scope at the moment it is
     * called. Reading it here instead would throw for exactly the handlers that most need it.
     *
     * What does *not* survive an await is `Message.sender`: `answerAddress()` reads the delivery when the
     * send is made, by the one exception documented there. So a send made later reaches the right window
     * carrying no sender, and that window cannot answer it.
     */
    sendToWindow(client: string, name: string, event: { type: string; [key: string]: unknown }): void {
      // An empty connection would send with none, and absent means *every* connection — the silent
      // widening from one window to all of them that this verb exists to prevent. The type says `string`,
      // so reaching this takes a cast or untyped code; it is a gate on the one wrong value, not on a shape.
      if (!client) {
        throw new Error(`sendToWindow("${name}") was given no connection to send to. A handler is handed the one it is serving as \`client\`, which is absent when the message came from another system or from nothing — to reach every window showing that plugin, use broadcastToPlugin.`);
      }
      boundHost().transport.rootEvents.emitPluginSend({ to: resolve(name), event, ...labels, ...answerAddress(), client });
    },

    sendToSystem(to: SystemTarget, event: { type: string; [key: string]: unknown }): void {
      sendIncoming({ to: typeof to === 'string' ? resolve(to) : getDesignated(to.role), event, ...labels, ...answerAddress() });
    },
  };
}

/** The sends made by nobody in particular: the untyped ones below, which packs and tooling use directly. */
const unboundSends = createSends();

/**
 * Sends an event to a plugin through the bus, which delivers it once a client is connected — and to **every**
 * window showing that plugin, since a plugin runs once per window. Backend only.
 *
 * That reach is the reason for the name. `sendToPlugin` beside it is the renderer's, and goes to one window's actor.
 * A backend send that only one window should act on says so in the event, as the host's `OPEN_PLUGIN` does.
 *
 * Untyped: packs use the `broadcastToPlugin` from their `#generated/events`.
 */
export function untypedBroadcastToPlugin(to: string, event: { type: string; [key: string]: unknown }): void {
  unboundSends.broadcastToPlugin(to, event);
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
export function _sendToLocalPlugin(ref: string, event: { type: string; [key: string]: unknown }): void {
  unboundSends.sendToPlugin(ref, event);
}

/**
 * Sends an event to a plugin in the one window being served, rather than to every window showing it.
 * Backend only, and only while handling a message that came from a connection.
 *
 * Untyped: packs use the `sendToWindow` from their `#generated/events`.
 */
export function untypedSendToWindow(client: string, to: string, event: { type: string; [key: string]: unknown }): void {
  unboundSends.sendToWindow(client, to, event);
}

/** A system: its ref, or the role a system plays (`{ role: 'brain' }`), found when the message is sent */
export type SystemTarget = string | { role: string };

/**
 * What a handler answers its asker with. Absent where the message named no sender, which is the whole point:
 * "is there anybody to answer?" is a question the type asks rather than one a global is probed for.
 *
 * **It is a send, not a resolve, so calling it twice sends twice — on purpose.** Nothing here is at-most-once
 * and nothing should be: there is no request id to answer against and an XState machine cannot await, so the
 * asker handles each answer as an event like any other. A handler that reports progress and then a result is
 * doing something ordinary, and refusing the second call would forbid it to protect against a mistake nobody
 * has made. What a double call cannot do is go somewhere unexpected: both answers carry the same address, so
 * the risk is a confused asker rather than a leak.
 *
 * Two things follow, and the second is the one to hold onto. A handler must not treat `reply` as evidence that
 * it has not already answered — it has no memory. And **a correlating layer built on top of this owns
 * at-most-once itself**: the moment answers are matched to requests, a second answer to a settled request is a
 * real error, and the place to refuse it is that layer, where the request id exists. Putting the rule here
 * instead would make it unavailable exactly where it could be checked properly.
 */
export type Reply<E extends { type: string } = { type: string; [key: string]: unknown }> = (event: E) => void;

/**
 * The answer function for one delivery, or nothing when that message named no sender.
 *
 * **Bound, not ambient.** It closes over the delivery it was built from, so a handler that stores it — in a
 * callback, a listener, an actor's input — still answers the right asker later. Reading the scope at use
 * instead is what makes a stored answer reach nobody: measured, a callback registered inside a delivery and
 * fired outside one saw no sender at all.
 *
 * **The asker names the way back, and which ways exist depends on which side is answering.** Three channels
 * against two sides is six cells, and two of them cannot happen:
 *
 * | the asker | answered on the backend | answered in a window |
 * |---|---|---|
 * | `bus` | in, onto the bus, to the asking system | out over this window's connection |
 * | `connection` | out to that connection alone | **impossible** — a window reaches no other connection |
 * | `window` | **impossible** — there is no window-local bus here | to the plugin beside the answerer |
 *
 * The two throw rather than falling back, because either would be a message delivered in the wrong process and
 * a silent broadcast is how that used to show up. `bus` answered in a window goes *out*, which looks like an
 * exception and is not: the window's one channel to the backend is its connection, and the API routes the
 * message on from there.
 *
 * **Both are assertions, not gates, and that is why they stay throws.** Nothing can reach either: an asker is
 * built at one of three doors and each door can only build the channel it is — `askerOf`
 * (`@abuddy/host/bus`'s `delivery.ts`) returns `bus` or `connection`, `connection.ts` in the shell returns
 * `bus`, `deliverInWindow` returns `window`, and `usePlugin` builds no asker at all. So the subject is this
 * program's own construction rather than anything a caller passes, and a `reportError` here would turn a
 * proven-impossible state into a line in a log while the process carried on inside it.
 *
 * Being unreachable means a mutation is the only way to watch them, so here are the two edits that fire them.
 * For the window cell: make the shell's `connection.ts` pass the message's `client` through as a
 * `{ kind: 'connection' }` asker instead of the `{ kind: 'bus' }` it builds. For the backend cell: make
 * `askerOf` return `{ kind: 'window' }`. Each is one line, and each is a real way someone could get this
 * wrong, which is what makes them worth naming rather than a trick to make a branch run.
 *
 * The messages say the host built the delivery, not that the handler called `reply` wrongly, because a pack's
 * handler is where the throw lands and it is the one party that cannot have caused it.
 *
 * The host is resolved on each call rather than at binding, so building one costs nothing and needs no app.
 *
 * @internal The SDK builds these for handlers (`defineHandlers`, `@abuddy/sdk/framework`); pack code receives
 * one rather than making it, which is what replaced an exported `reply()` that read the scope itself.
 */
export function _replyTo(delivery: _Delivery | undefined): Reply | undefined {
  if (delivery?.asker === undefined) return undefined;
  const { asker, receiver } = delivery;
  return (event) => {
    const message: Message = { to: asker.ref, event, sender: receiver, answering: true };
    if (_isFeHostBound()) {
      if (asker.kind === 'window') { deliverInWindow(message); return; }
      if (asker.kind === 'bus') { boundFeHost().client.send(message); return; }
      throw new Error(`Can't answer "${asker.ref}" on connection "${asker.client}" from a window: a window reaches the backend and the plugins beside it, not another window's connection. Nothing in this window builds a connection asker, so the delivery was constructed wrongly rather than answered wrongly — the handler that called reply is not at fault.`);
    }
    const { rootEvents } = boundHost().transport;
    if (asker.kind === 'connection') { rootEvents.emitPluginSend({ ...message, client: asker.client }); return; }
    if (asker.kind === 'bus') { rootEvents.emitIncoming(message); return; }
    throw new Error(`Can't answer the "${asker.ref}" plugin in its own window from the backend: there is no window-local bus here, so a backend send to a plugin either reaches every window (broadcastToPlugin) or one connection (sendToWindow). Nothing on the backend builds a window asker, so the delivery was constructed wrongly rather than answered wrongly — the handler that called reply is not at fault.`);
  };
}

/**
 * The connection a delivery's asker arrived on, or nothing where it named none.
 *
 * **Given the delivery rather than reading the scope**, for `_replyTo`'s reason: both handed members come
 * off one read taken as the handler is entered, so an address a handler stores still points at the window
 * it was serving. A system knows no other window — nothing holds a registry of them — so this is the whole
 * of what `sendToWindow` can address.
 *
 * @internal The SDK hands these to handlers (`defineHandlers`, `@abuddy/sdk/framework`); pack code receives
 * one rather than asking for it.
 */
export function _clientOf(delivery: _Delivery | undefined): string | undefined {
  const asker = delivery?.asker;
  return asker?.kind === 'connection' ? asker.client : undefined;
}

/**
 * Sends an event to a backend system, by ref or by the role it plays. Untyped: packs use the `sendToSystem` from
 * their `#generated/events`, which takes names and checks the event against what the system declares.
 */
export function untypedSendToSystem(to: SystemTarget, event: { type: string; [key: string]: unknown }): void {
  unboundSends.sendToSystem(to, event);
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
 * `sendToWindow` typed against a plugin event map, with the connection it addresses in front.
 *
 * `TypedSendToPlugin` with that one parameter added through both arms, so a plugin's events are checked
 * exactly as a broadcast's are and only the address differs. `client` is `string` rather than
 * `string | undefined` deliberately: a handler is handed `client?: string`, so it cannot call this until
 * it has said what it does when there is no window — which is `reply?.()`'s discipline written for a
 * three-argument send.
 */
export type TypedSendToWindow<M extends PluginEvents> = (<P extends keyof M & string>(
  client: string,
  plugin: P,
  event: OneSend<IsUnion<P>, M[P]['type'], M[P]>,
) => void) & ((client: string, plugin: FeatureRef, event: FeatureSettingsUpdated) => void);

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
  /** Backend: to that plugin on one connection — the window a handler is serving, handed to it as `client` */
  sendToWindow: TypedSendToWindow<P>;
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
  return createSends({ resolve: (name) => resolveName(name, packId), from: packId }) as unknown as TypedEvents<P, S>;
}
