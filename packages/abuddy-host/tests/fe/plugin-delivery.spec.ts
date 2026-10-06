// Handing an event to an actor names the participant it is for — and *only* that one.
//
// Two claims, and the second is the one that had no case until a probe went looking. A send made while
// handling a message carries the handler's ref, which is what the whole delivery scope is for; so a plugin
// that reaches another actor's `send` directly, from inside its own delivery, hands that actor its own
// scope. Measured 2026-10-06: the shell handling a pack unload that way saw itself as the *packs plugin*,
// with the packs system as its asker — so a send it made there would have been stamped with a plugin that
// did not make it, and a handler it ran would have been handed a `reply` for a question asked of somebody
// else.
//
// That is why there is one funnel and why nothing may reach an actor's `send` around it. `check:specifiers`
// cannot see the difference — both are `.send(` — so this is where the difference is held.
import { describe, expect, it } from 'vitest';
import { createActor, setup } from 'xstate';
import { _currentDelivery, _runDelivery, type _Delivery } from '@abuddy/sdk/events';
import { NOBODY_ASKED, sendToPluginActor } from '../../src/fe/plugin-delivery.ts';

/** An actor that records what was being handled each time it is given an event */
function recording() {
  const seen: Array<_Delivery | undefined> = [];
  const actor = createActor(setup({}).createMachine({
    on: { PING: { actions: () => { seen.push(_currentDelivery()); } } },
  })).start();
  return { seen, actor };
}

/** A message being handled when the send is made, with somebody waiting on an answer to it */
const HANDLING: _Delivery = { receiver: 'pack/sender', asker: { kind: 'bus', ref: 'pack/asker' } };

describe('handing an actor an event', () => {
  it('names the receiver while it handles it', () => {
    const { seen, actor } = recording();

    sendToPluginActor(actor, 'pack/receiver', { type: 'PING' }, NOBODY_ASKED);

    expect(seen).toEqual([{ receiver: 'pack/receiver', asker: undefined }]);
  });

  it('carries an asker when the send has one to pass', () => {
    const { seen, actor } = recording();

    sendToPluginActor(actor, 'pack/receiver', { type: 'PING' }, { kind: 'window', ref: 'pack/curious' });

    expect(seen).toEqual([{ receiver: 'pack/receiver', asker: { kind: 'window', ref: 'pack/curious' } }]);
  });

  /**
   * **The case the funnel exists for.** The sender is mid-delivery and owes an answer to `pack/asker`; the
   * receiver must inherit none of that, or it answers a question nobody asked it.
   *
   * Replace the body of `sendToPluginActor` with a bare `actor.send(event)` and this is what fails.
   */
  it('hands the receiver none of the scope the sender was in', () => {
    const { seen, actor } = recording();

    _runDelivery(HANDLING, () => {
      sendToPluginActor(actor, 'pack/receiver', { type: 'PING' }, NOBODY_ASKED);
    });

    expect(seen, "the sender's ref and its asker both stop here").toEqual([
      { receiver: 'pack/receiver', asker: undefined },
    ]);
  });

  // And the sender goes back to owing its own answer, so what it does after the send is unchanged
  it('gives the sender its own delivery back afterwards', () => {
    const { actor } = recording();
    let after: _Delivery | undefined;

    _runDelivery(HANDLING, () => {
      sendToPluginActor(actor, 'pack/receiver', { type: 'PING' }, NOBODY_ASKED);
      after = _currentDelivery();
    });

    expect(after).toEqual(HANDLING);
    expect(_currentDelivery(), 'and nothing is left behind out here').toBeUndefined();
  });
});
