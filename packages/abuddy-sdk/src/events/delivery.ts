/**
 * Which message is being handled right now, so a handler can answer its sender without being told who that is.
 *
 * **Why this is not a field on the event.** The envelope's central rule forbids it: `event` arrives exactly as
 * the sender wrote it, which `outgoing-events.spec.ts` pins with a deliberate `pluginId` collision. So the
 * address is kept *beside* the handler, and this is where.
 *
 * **This header used to argue there was nowhere else to put it** — that an XState action is handed
 * `{ context, event, self, system }`, that `context` is per-actor and `self` and `system` fixed, and so the
 * event was the only alternative. The premise was true and the conclusion was not: what a handler is handed is
 * ours, not XState's. `defineHandlers` (`@abuddy/sdk/framework`) wraps a machine's action record and adds a
 * fifth member, `reply`, bound to the delivery the handler was entered in. Pack code receives an answer now
 * rather than reading one from here, which is why `reply()` is gone from this module: the two things it did
 * badly were leaving "is there anybody to answer?" invisible in a signature, and losing the sender for any
 * answer stored and called later.
 *
 * What is left here is the plumbing that still has to be ambient: the bus opens a scope per delivery, and
 * `createSends` reads its `receiver` to stamp `Message.sender` on an ordinary send. That one cannot be a
 * parameter, because every send in pack code would have to carry it.
 *
 * **One reader, and it is a plain variable set and restored around the delivery.** It is exact for what reads
 * it: a handler is *handed* its answer, and the wrapper builds that answer synchronously as the handler is
 * entered, before any `await` can have happened. The backend installed an `AsyncLocalStorage` over this until
 * `reply` stopped being ambient, which is the change that made the store unnecessary — see
 * `@abuddy/host/bus`'s `delivery.ts` for what removing it cost and what it bought.
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
 * **What does not work is reading this scope from a stored function.** An `await` is fine, and so is a timer the
 * handler itself schedules: both create their async resource inside the scope and inherit it. A bare callback
 * creates nothing, so it runs in whatever scope is current when it is called — from another delivery it reads
 * *that* sender, and from none it reads nothing. That is measured, and it is the gap a bound `reply` closes: an
 * answer handed to a handler keeps working wherever the handler stores it, because it never comes back here.
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

/** The holder, and the whole mechanism — in a window and on the backend alike */
let current: _Delivery | undefined;

/**
 * The message being handled in this call stack, if any.
 *
 * @internal Host and SDK only: a pack reads its sender through `reply`, which needs no address.
 */
export function _currentDelivery(): _Delivery | undefined {
  return current;
}

/**
 * Runs `body` as the handling of `delivery`, restoring whatever was being handled before.
 *
 * @internal Called by the four doors named above: `deliverAs` on the backend, `sendToPluginActor` and
 * `usePlugin` in a window.
 */
export function _runDelivery<T>(delivery: _Delivery, body: () => T): T {
  const previous = current;
  current = delivery;
  try {
    return body();
  } finally {
    current = previous;
  }
}

