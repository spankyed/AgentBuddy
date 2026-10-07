// `BusMessage` is a hand-written copy of the SDK's `Message`, and this is what holds the two together.
//
// Hand-written is the right call there: `src/engine/api-client.ts` declares almost no dependencies on purpose,
// because it talks to a *running* app that may be a downloaded Beta rather than this checkout, so it cannot
// import the shape it is describing. What that buys in independence it pays for in drift, and nothing was
// paying attention — a field added to the envelope would simply be missing here, and an agent driving the app
// would read `undefined` for something the app had sent.
//
// Mutual assignability rather than two `extends` checks in one direction: a field dropped from `BusMessage` and
// a field invented by it are different mistakes and both are mistakes. The specs here may import from
// `@abuddy/sdk` even though the module under test may not, which is the whole reason this can be checked at all.
//
// The one deliberate difference is `client`, which the API stamps per connection rather than a sender setting,
// and it is in both shapes because `bus.sub` delivers it. If a field is ever added that genuinely must not be
// mirrored, it belongs in an `Omit` here with its reason beside it, the way the API's own envelope check does it.
import { describe, expect, it } from 'vitest';
import type { Message } from '@abuddy/sdk/events';
import type { BusMessage } from '../../src/engine/api-client.ts';

/** `true` only when `A` and `B` describe the same fields with the same types, in both directions. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

describe('BusMessage mirrors Message', () => {
  /**
   * A type-level assertion, so the failure is the typecheck rather than this run: `npm run typecheck:cli`
   * covers these tests. The runtime body exists to give the case a home and to say what to do.
   *
   * To watch it fire, remove a field from `BusMessage` — `readonly answering?: true` is the newest — and this
   * stops compiling. Adding one to `Message` alone does the same.
   */
  it('names every field the envelope does, and no others', () => {
    const matches: Same<Required<Message>, Required<BusMessage>> = true;
    expect(matches, 'add the missing field to BusMessage, or omit it here with a reason').toBe(true);
  });

  // The mirror is readonly and the envelope is not, which must not be what makes them differ
  it('differs from the envelope only in readonly-ness, which assignability ignores', () => {
    const fromWire: BusMessage = { to: 'pack/feature', event: { type: 'PING' }, answering: true };
    const asEnvelope: Message = fromWire;
    expect(asEnvelope.answering).toBe(true);
  });
});
