// Every send names a call, and an answer names the call it answers.
//
// Correlation used to be a three-step obligation each feature discharged by hand — mint an id, store it,
// settle it — and the failures distributed across the steps rather than clustering: one feature did all
// three, one declared a `requestId` end to end and minted none, two stored one and never cleared it, and a
// terminal's id did not exist until its answer. A call on the envelope is what none of those could get
// wrong, because the send mints it and `reply` echoes it.
//
// What is asserted here is the half no feature can see: that a send stamps one at all, that an answer names
// the request's rather than its own, and that the reserved key reaches the receiver's event.
import { describe, expect, it } from 'vitest';
import {
  _CALL_KEY, callOf, newCall, untypedBroadcastToPlugin, untypedSendToSystem, _callOn, _replyTo,
  type Message,
} from '../../src/events/index.ts';
import { startTestRuntime, testRootEvents } from '../../src/testing/index.ts';

startTestRuntime({ packs: { pluginIds: () => ['pack/plugin'], systemIds: () => ['pack/system'] } as never });

/** Everything the bus saw while `body` ran, both directions */
function onBus(body: () => void): Message[] {
  const seen: Message[] = [];
  const stops = [testRootEvents.onPluginSend((m) => seen.push(m)), testRootEvents.onIncoming((m) => seen.push(m))];
  try { body(); } finally { for (const stop of stops) stop(); }
  return seen;
}

describe('a call is minted by the send', () => {
  /**
   * **The invariant the whole design rests on**, and the one a feature cannot check for itself: a send is
   * named whether or not anybody asked for the name. Drop the mint from `createSends` and this is what fails.
   *
   * It is asserted over both verbs rather than one, because each builds its own envelope — the file this
   * guards has four such lines, and a mint added to three of them would read as done.
   */
  it('names every send, asked for or not', () => {
    const seen = onBus(() => {
      untypedBroadcastToPlugin('pack/plugin', { type: 'NEWS' });
      untypedSendToSystem('pack/system', { type: 'DO_IT' });
    });

    expect(seen.map(({ call }) => typeof call)).toEqual(['string', 'string']);
    expect(new Set(seen.map(({ call }) => call)).size, 'and each send its own').toBe(2);
  });

  // The ask that needs its id before the send happens supplies one, and is answered with what it supplied
  it('uses the call it was given, and hands it back', () => {
    const call = newCall();
    let returned: string | undefined;
    const seen = onBus(() => { returned = untypedSendToSystem('pack/system', { type: 'DO_IT' }, { call }); });

    expect(seen[0]?.call, 'the envelope carries the one supplied').toBe(call);
    expect(returned, 'and the send answers with it, so a caller that minted none can still store it').toBe(call);
  });

  it('mints distinct calls', () => {
    expect(newCall()).not.toBe(newCall());
  });
});

describe('an answer names the call it answers', () => {
  /**
   * `reply` reads the call off the **delivery**, not the event — the same reason it reads the asker there.
   * An answer built after an `await`, or from a callback stored earlier, still names the right request.
   */
  it('echoes the call being handled, and mints its own besides', () => {
    const seen = onBus(() => {
      _replyTo({ receiver: 'pack/system', asker: { kind: 'bus', ref: 'pack/asker' }, call: 'c-the-ask' })?.({ type: 'DONE' });
    });

    expect(seen[0]?.answering, 'the request it answers').toBe('c-the-ask');
    expect(seen[0]?.call, 'and its own, because an answer is a send and may itself be answered')
      .toEqual(expect.any(String));
    expect(seen[0]?.call).not.toBe('c-the-ask');
  });

  // A request that carried no call cannot be answered by name, and `reply` says so rather than inventing one
  it('leaves it absent when the request named none', () => {
    const seen = onBus(() => {
      _replyTo({ receiver: 'pack/system', asker: { kind: 'bus', ref: 'pack/asker' } })?.({ type: 'DONE' });
    });

    expect(seen[0]?.answering).toBeUndefined();
  });
});

describe('the reserved key a door injects', () => {
  /**
   * **Only an answer carries one.** The first version injected `answering ?? call`, so every delivered event
   * named a call — and a request's own has no reader on the event: whoever receives a request answers it with
   * `reply`, which takes the call from the delivery. The pack suite found it, a system recording what it
   * heard having recorded `_call` on every notification.
   */
  it('is present on an answer and absent on anything else', () => {
    expect(_callOn({ answering: 'c-the-ask' })).toEqual({ [_CALL_KEY]: 'c-the-ask' });
    expect(_callOn({}), 'a request or a notification names no call it belongs to').toEqual({});
  });

  it('is what callOf reads back', () => {
    expect(callOf({ type: 'DONE', ..._callOn({ answering: 'c-1' }) })).toBe('c-1');
    expect(callOf({ type: 'NEWS' })).toBeUndefined();
  });

  /**
   * **The key is reserved, and this is the case that says so.** An event is an open bag — a pack may put any
   * field on one, which `outgoing-events.spec.ts` pins with a deliberate `pluginId` collision — so the one
   * field a door writes has to win, or a pack could make its own answer look like it belonged to another
   * call. A pack rule refuses one written in pack source; this is what the runtime does if one arrives.
   */
  it('wins over a pack field of the same name', () => {
    const delivered = { type: 'DONE', [_CALL_KEY]: 'c-the-packs-own', ..._callOn({ answering: 'c-the-real-one' }) };

    expect(callOf(delivered)).toBe('c-the-real-one');
  });

  // `string`, so a non-string arriving from anywhere reads as no call rather than as one
  it('reads a non-string as no call at all', () => {
    expect(callOf({ type: 'DONE', [_CALL_KEY]: 7 })).toBeUndefined();
  });
});
