// Handing an event to an actor in this window, named so the handler can be answered.
//
// **At the seam rather than in the shell, because more than one feature hands events to actors.** It was the
// application feature's, and the packs feature reaching it is the cross-feature import `check:specifiers`
// refuses — which left that feature sending to the shell's actor directly, and a direct send is the one thing
// this exists to replace. A port two features need lives here, as `pack-frontends.ts` does.
import type { AnyActorRef, AnyEventObject } from 'xstate';
import { _runDelivery, type _Asker } from '@abuddy/sdk/events';

/**
 * Hands an actor an event, naming the participant it is for as long as it is handled.
 *
 * **Every hand-off to an actor in this window goes through here**, which is the point, and it is two claims
 * rather than one. A send the handler then makes carries that participant's ref as `Message.sender`, so the
 * system it asks can answer *this* plugin in the window it was asked from. And the scope the *sender* was in
 * does not reach the receiver: measured 2026-10-06, a plugin reaching the shell's actor directly from inside
 * its own delivery left the shell handling the event as that plugin, with that plugin's asker — so a send the
 * shell made there was stamped with a plugin that did not make it, and a handler it ran was handed a `reply`
 * addressed to a system that had asked the plugin something else.
 *
 * One function rather than a wrapper at each call site, because the list of call sites was the bug: it was
 * documented as four places and was nine. `usePlugin` is the one other scope-setter in a window, and it wraps
 * the actor it hands out rather than a send it makes.
 *
 * **It takes an actor, not a lookup that may miss.** Whether a missing plugin is a bug or an ordinary race
 * differs by call site — the shell's own lifecycle sends address a plugin it just spawned, where absence is an
 * invariant broken and worth a crash, while a send arriving for a plugin whose pack has unloaded is neither. A
 * `?.` here would have levelled those two to the quieter one, which it briefly did.
 */
export function sendToPluginActor(actor: AnyActorRef, ref: string, event: AnyEventObject, asker: _Asker | undefined): void {
  _runDelivery({ receiver: ref, asker }, () => actor.send(event));
}

/**
 * What a send with no question behind it passes for `asker`: a lifecycle event, a hotkey, a navigation or a
 * pack coming and going has nobody waiting on an answer, so the handler is handed no `reply` — which is what
 * "nobody asked" is meant to look like.
 *
 * A name rather than a bare `undefined`, and the parameter stays **required** so the compiler walks every call
 * site. That is this function's whole history: the count was documented as four and was nine, and a default
 * would have quietly restored exactly that.
 */
export const NOBODY_ASKED = undefined;
