// Building the event a delivery door would hand a machine, for a spec that drives one directly.
//
// **Why a test needs this at all.** A correlation is read in a transition guard, and a guard is handed
// `{ context, event }` and nothing else — so the call a message belongs to rides on the delivered event under
// a reserved key (`_callOn`/`_callOf`, `@abuddy/sdk/events`). In the app a door writes that key. A spec that
// starts a plugin's machine with `createActor` and sends it an answer has no door, so without this it would
// have to name the key itself, which the `reserved-event-keys` pack rule refuses and which would make every
// such spec depend on an `@internal` constant.
import { _callOn } from '../events/index.ts';

/**
 * The answer to `call`, as a door would deliver it: `event` with the call it answers on it.
 *
 * ```ts
 * const call = lastSentCall();                       // what the machine asked under
 * actor.send(answerTo(call, { type: 'DONE', data })); // what it would receive
 * ```
 *
 * **It takes the call rather than minting one**, because the asker is what mints: a spec asserts that the
 * machine takes the answer to the ask it made and ignores one for an ask it has abandoned, and both halves
 * need the spec to say which call it means.
 *
 * Only an answer carries a call — a notification belongs to none — so there is no helper for the other
 * direction: a spec sends a notification as the plain event it is.
 */
export function answerTo<E extends { type: string }>(call: string, event: E): E {
  return { ...event, ..._callOn({ answering: call }) };
}
