// A system can ask one window as well as all of them, which is the other half of being answerable.
//
// `reply` let a window answer a system. Asking was still a broadcast, so one question collected one answer
// per open window — the system got N replies to a thing it asked once. `sendToWindow` names the connection
// the message under handling arrived on, which is the only window a system has an address for: nothing holds
// a registry of them.
//
// The pair is the subject. `broadcastToPlugin` is news every window needs; `sendToWindow` is for what only
// the window that asked should act on, and the cases below are the same send differing in `Message.client`.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _runDelivery, untypedBroadcastToPlugin, untypedSendToWindow, type Message } from '@abuddy/sdk/events';
import { startTestRuntime, testRootEvents } from '@abuddy/sdk/testing';
import { HOST_ENTITY_TYPES } from '../../src/app-state/index.ts';
import { createPackRegistry } from '../../src/packs/registry.ts';
import { deliverAs } from '../../src/bus/delivery.ts';

startTestRuntime({ entityTypes: HOST_ENTITY_TYPES, packs: createPackRegistry() });

const MEMOS = 'memo-pack/memos';
/** A window's ask: the API stamps the connection it arrived on, which is what makes it addressable */
const FROM_A_WINDOW = { to: MEMOS, sender: MEMOS, client: 'c-main' };
/** Another system's ask, which names no connection */
const FROM_A_SYSTEM = { to: MEMOS, sender: 'memo-pack/other' };

let sent: Message[];
let stop: () => void;

beforeEach(() => {
  sent = [];
  stop = testRootEvents.onPluginSend((message) => { sent.push(message); });
});
afterEach(() => stop());

describe('a system serving one window', () => {
  it('reaches that window alone', () => {
    deliverAs(FROM_A_WINDOW, () => {
      untypedSendToWindow(MEMOS, { type: 'MEMO_ADDED' });
    });

    expect(sent.map(({ to, client }) => ({ to, client })))
      .toEqual([{ to: MEMOS, client: 'c-main' }]);
  });

  // The pair: the same send, broadcast, names no connection — which is how the bus reaches every window
  it('reaches every window when it broadcasts instead', () => {
    deliverAs(FROM_A_WINDOW, () => {
      untypedBroadcastToPlugin(MEMOS, { type: 'MEMO_ADDED' });
    });

    expect(sent.map(({ client }) => client), 'absent means every connection').toEqual([undefined]);
  });

  // It is a send like any other, so it still says who made it — a window can answer it
  it('carries the handling feature as its sender', () => {
    deliverAs(FROM_A_WINDOW, () => {
      untypedSendToWindow(MEMOS, { type: 'MEMO_ADDED' });
    });

    expect(sent[0].sender, 'so the window it asks can answer *it*').toBe(MEMOS);
  });
});

/**
 * Where there is no window, it refuses rather than widening.
 *
 * Falling back to a broadcast is the one thing it must not do: a send that quietly went from one window to
 * all of them is the bug this verb exists to prevent, and the caller cannot see it happen.
 */
describe('a system serving no window', () => {
  it('refuses while handling another system\'s message', () => {
    expect(() => deliverAs(FROM_A_SYSTEM, () => {
      untypedSendToWindow(MEMOS, { type: 'MEMO_ADDED' });
    })).toThrow(/needs a message from a window being handled/);

    expect(sent, 'and nothing was sent in its place').toEqual([]);
  });

  // A timer, a subscription, host plumbing — nothing is being handled at all
  it('refuses outside any message', () => {
    expect(() => untypedSendToWindow(MEMOS, { type: 'MEMO_ADDED' }))
      .toThrow(/needs a message from a window being handled/);

    expect(sent).toEqual([]);
  });

  // The error names the alternative, because reaching every window is the thing the caller probably wants
  it('names broadcastToPlugin as the way to reach every window', () => {
    expect(() => untypedSendToWindow(MEMOS, { type: 'MEMO_ADDED' })).toThrow(/broadcastToPlugin/);
  });
});

/** A reply goes to the asker; this goes to a plugin of the sender's choosing in that same window */
describe('beside reply', () => {
  it('addresses a different plugin on the connection the ask came from', () => {
    deliverAs({ to: MEMOS, sender: MEMOS, client: 'c-popout' }, () => {
      untypedSendToWindow('memo-pack/sidebar', { type: 'MEMO_ADDED' });
    });

    expect(sent.map(({ to, client }) => ({ to, client })))
      .toEqual([{ to: 'memo-pack/sidebar', client: 'c-popout' }]);
  });

  // Two windows asking the same thing are answered separately, which is what one-answer-per-ask means
  it('serves each window on its own connection', () => {
    for (const client of ['c-main', 'c-popout']) {
      deliverAs({ to: MEMOS, sender: MEMOS, client }, () => {
        untypedSendToWindow(MEMOS, { type: 'MEMO_ADDED' });
      });
    }

    expect(sent.map(({ client }) => client)).toEqual(['c-main', 'c-popout']);
  });
});
