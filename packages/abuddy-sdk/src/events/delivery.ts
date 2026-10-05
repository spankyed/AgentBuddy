/**
 * Which message is being handled right now, so a handler can answer its sender without being told who that is.
 *
 * **Why this is not a field on the event.** An XState action is handed `{ context, event, self, system }`:
 * `context` is per-actor and `self` and `system` are fixed, so `event` is the only per-message thing in scope.
 * Putting a return address inside it is the only alternative, and the envelope's central rule forbids it —
 * `event` arrives exactly as the sender wrote it, which `outgoing-events.spec.ts` pins with a deliberate
 * `pluginId` collision. So the address is kept *beside* the handler instead, and this is where.
 *
 * **Two readers, because one module serves two runtimes.** The default is a plain variable set and restored
 * around the delivery, which is exact for a handler that answers before it yields. One that `await`s first —
 * the ordinary shape of backend work — needs more than a variable can give, so `@abuddy/host/bus` installs an
 * `AsyncLocalStorage` reader over the same interface. What then inherits the scope is anything the handler's
 * own code creates inside the delivery, an **invoked actor included**, since its promise is created while the
 * transition is being processed; `reply.spec.ts` pins that one, and removing the async reader fails it along
 * with every other awaited answer. This module stays free of `node:` imports because `@abuddy/sdk/events` is
 * bundled into pack frontends.
 *
 * **Four doors set it, and that they are doors rather than call sites is the point.** On the backend,
 * `@abuddy/host/bus`'s `deliverAs`: the bus routing a message to a system, and the host handing one to an early
 * system. In a window, `sendToPluginActor` — the one function every send to a plugin's actor goes through — and
 * `usePlugin`, which wraps the actor it gives a component rather than any one send.
 *
 * It was a list of four *places* until a test asked each of them to answer, and the real number was nine: the
 * shell reached plugins from eight sites and named them at one, so a plugin handling anything the backend
 * broadcast, or its own `PLUGIN_ACTIVATED`, sent on with no `sender` and could not be answered. A count a
 * reader has to keep is the failure; `sendToPluginActor` is the correction.
 *
 * **What does not work** is storing a function during one delivery for somebody else to call later. An `await`
 * is fine, and so is a timer the handler itself schedules: both create their async resource inside the scope and
 * inherit it. A bare callback creates nothing, so it runs in whatever scope is current when it is called — from
 * another delivery it reads *that* sender, and from none it reads nothing. `reply` throws on the second rather
 * than broadcasting, a private answer sent to every window being worse than an error.
 */

/**
 * The message being handled, as much of it as answering needs.
 *
 * @internal Host and SDK only. Pack code never names it: a handler answers with `reply`, which takes no address.
 */
export interface _Delivery {
  /** The ref of the participant being handled. A send made during the delivery stamps it as `Message.sender`. */
  receiver: string;
  /** Where an answer goes: the ref that sent this message, when it said. Absent for a send that named no sender. */
  replyTo?: string;
  /** The connection to answer on, when the message came from one. Absent for a backend-to-backend send. */
  client?: string;
}

/** The synchronous holder, which is the whole mechanism in a browser and the fallback on the backend */
let synchronous: _Delivery | undefined;

/** Installed by the host so an answer survives an `await`; absent in the renderer, which has no equivalent */
let asyncReader: (() => _Delivery | undefined) | undefined;

/**
 * The message being handled in this call stack, if any.
 *
 * @internal Host and SDK only: a pack reads its sender through `reply`, which needs no address.
 */
export function _currentDelivery(): _Delivery | undefined {
  return asyncReader?.() ?? synchronous;
}

/**
 * Runs `body` as the handling of `delivery`, restoring whatever was being handled before.
 *
 * @internal Called by the three places that hand a message to an actor: the bus's `routeIncoming`, its early
 * systems, and the renderer shell's `deliverPluginEvents`.
 */
export function _runDelivery<T>(delivery: _Delivery, body: () => T): T {
  const previous = synchronous;
  synchronous = delivery;
  try {
    return body();
  } finally {
    synchronous = previous;
  }
}

/**
 * Gives this process a reader that survives `await`. The host passes an `AsyncLocalStorage`'s `getStore`.
 *
 * @internal
 */
export function _installAsyncDeliveryReader(reader: () => _Delivery | undefined): void {
  asyncReader = reader;
}
