// Answering whoever asked, without the handler being told who that is.
//
// A system's handler is given `{ context, event, self, system }` and nothing about the message's sender, so the
// bus names the message for the duration of the delivery and `reply` reads it back. The two things that makes
// true are: the answer goes to the ref that asked rather than to a name the handler had to write, and it goes on
// the connection it was asked from rather than to every window.
//
// The case that carries the design is `answers each of two overlapping asks on its own connection`. Everything
// else here would also pass if the scope were a single module-level variable; only that one fails, because a
// handler that awaits before answering is the ordinary shape of backend work and two of them overlap constantly.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createActor, fromPromise, setup, type AnyActorRef } from 'xstate';
import { startTestRuntime, takeSystemErrors, testRootEvents } from '@abuddy/sdk/testing';
import { _runDelivery, reply, untypedBroadcastToPlugin, untypedSendToSystem, type Message } from '@abuddy/sdk/events';
import { _whenSatisfied } from '@abuddy/sdk/testing/waiting';
import { createAppBus } from '../../src/bus/index.ts';
import { HOST_ENTITY_TYPES } from '../../src/app-state/index.ts';
import { createPackRegistry } from '../../src/packs/registry.ts';
import { hostRegistration } from '../../src/features/registration.ts';

const registry = createPackRegistry();
startTestRuntime({ entityTypes: HOST_ENTITY_TYPES, packs: registry });

/**
 * A delay inside a *handler*, which is the shape under test rather than a test waiting for anything: a backend
 * system's work is I/O, so it awaits before it answers, and that is what makes the delivery scope load-bearing.
 * The cases themselves await the answer (`untilBus`); see `@abuddy/sdk/testing/waiting` for why.
 */
const after = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A system that answers a PING with a MEMO_ADDED, waiting `wait` ms first so two asks can be put in flight
 * together. The handler names no address: that is the whole point of the file.
 */
const answering = setup({}).createMachine({
  on: {
    PING: {
      actions: async ({ event }) => {
        await after((event as { wait?: number }).wait ?? 0);
        reply({ type: 'MEMO_ADDED', tag: (event as { tag?: string }).tag });
      },
    },
    // Names its target rather than answering, which is what every system did before `reply` existed. The
    // envelope should still say who sent it, and that stamp is `createSends`' rather than `reply`'s.
    ANNOUNCE: {
      actions: () => { untypedBroadcastToPlugin('memo-pack/memos', { type: 'MEMOS_CONNECTED' }); },
    },
  },
});

/**
 * A system that answers from inside an **invoked** actor rather than from the action itself.
 *
 * This is the shape the SDK's licence for the synchronous holder does not cover — its comment reads "none uses
 * `fromPromise`", which is a claim about today's pack code and not an invariant, and `host/settings` already
 * invokes one. The promise is created while the transition is being processed, which is inside the delivery, so
 * the question is whether that is enough for the scope to reach it.
 */
const invoking = setup({
  actors: {
    answerLater: fromPromise(async ({ input }: { input: { tag?: string } }) => {
      await after(5);
      reply({ type: 'MEMO_ADDED', tag: input.tag });
    }),
  },
}).createMachine({
  initial: 'idle',
  states: {
    idle: { on: { PING: 'working' } },
    working: {
      invoke: {
        src: 'answerLater',
        input: ({ event }) => ({ tag: (event as { tag?: string }).tag }),
        onDone: 'idle',
        onError: 'idle',
      },
    },
  },
});

/**
 * Asks the answering system and records what comes back: the asker in a system-to-system round trip.
 *
 * It has a plugin as well as a system, which is the point — a feature's two halves share one ref, so before
 * `reply` routed on the connection the answer went to this *plugin*, in every window, and the system that
 * asked got nothing. The case below asserts both halves of that: the system has it, and no window did.
 */
const answered: string[] = [];
const asking = setup({}).createMachine({
  on: {
    GO: { actions: () => { untypedSendToSystem('memo-pack/memos', { type: 'PING', tag: 'from-a-system' }); } },
    MEMO_ADDED: { actions: ({ event }) => { answered.push(String((event as { tag?: string }).tag ?? '')); } },
  },
});

const memoFeatures = {
  memos: { system: { machine: answering, receives: ['PING', 'ANNOUNCE'] }, plugin: { receives: ['MEMOS_CONNECTED', 'MEMO_ADDED'] } },
  invoker: { system: { machine: invoking, receives: ['PING'] }, plugin: { receives: ['MEMO_ADDED'] } },
  asker: { system: { machine: asking, receives: ['GO', 'MEMO_ADDED'] }, plugin: { receives: ['MEMO_ADDED'] } },
};

let bus: AnyActorRef;
const outgoing: Message[] = [];
const answers = () => outgoing.filter(({ event }) => event.type === 'MEMO_ADDED');
let stopOutgoing: () => void;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** What a client's send looks like once the API has stamped the connection it arrived on */
const ask = (message: Message) => { bus.send({ type: 'INCOMING', message }); };

/**
 * Re-reads `satisfied` whenever anything crosses the bus, so a case awaits its answer rather than a delay.
 *
 * Both directions, because an answer goes out to a connection or in to a system depending on who asked, and a
 * case should not have to know which to subscribe to. A negative assertion beside it — "and no window saw it" —
 * is safe once the positive one has arrived: `reply` makes one send, so when it has happened the other has not.
 */
const untilBus = (satisfied: () => boolean, describe: string) => _whenSatisfied(
  (notify) => {
    const stops = [testRootEvents.onOutgoing(notify), testRootEvents.onIncoming(notify)];
    return () => { for (const stop of stops) stop(); };
  },
  () => satisfied() || undefined,
  describe,
);

beforeEach(async () => {
  outgoing.length = 0;
  answered.length = 0;
  stopOutgoing = testRootEvents.onOutgoing((message) => { outgoing.push(message); });
  registry.registerPack({ id: 'memo-pack', features: memoFeatures });
  registry.registerPack(hostRegistration());
  bus = createActor(createAppBus(registry), { systemId: 'host/bus' }).start();
  testRootEvents.emitConnected();
  await flush();
});

afterEach(() => {
  bus.stop();
  stopOutgoing();
  registry.unregisterPack('memo-pack');
  registry.unregisterPack('host');
  takeSystemErrors();
});

describe('reply', () => {
  it('answers the ref that asked, on the connection it asked from', async () => {
    ask({ to: 'memo-pack/memos', event: { type: 'PING' }, sender: 'memo-pack/memos', client: 'c-main' });
    await untilBus(() => answers().length === 1, 'the answer to the ask');

    expect(answers()).toEqual([
      { to: 'memo-pack/memos', event: { type: 'MEMO_ADDED', tag: undefined }, sender: 'memo-pack/memos', client: 'c-main' },
    ]);
  });

  /**
   * The isolation that the whole mechanism rests on, and the only case here that a single shared variable fails.
   *
   * Two asks go in flight together from different connections; the first waits longer, so its answer is built
   * *after* the second delivery has already come and gone. Each must still answer its own asker.
   */
  it('answers each of two overlapping asks on its own connection', async () => {
    ask({ to: 'memo-pack/memos', event: { type: 'PING', wait: 40, tag: 'slow' }, sender: 'memo-pack/memos', client: 'c-main' });
    ask({ to: 'memo-pack/memos', event: { type: 'PING', wait: 5, tag: 'fast' }, sender: 'memo-pack/memos', client: 'c-popout' });
    await untilBus(() => answers().length === 2, 'both answers');

    const byTag = new Map(answers().map((message) => [message.event.tag as string, message.client]));
    expect(byTag.get('fast'), 'the second ask is answered on the second connection').toBe('c-popout');
    expect(byTag.get('slow'), 'and the first on the first, though it finished later').toBe('c-main');
  });

  /**
   * An answer sent from inside an invoked actor, which is the one delivery shape nothing asserted.
   *
   * It matters because `invoke` is ordinary XState and a system reaching for it has no reason to suspect that
   * answering becomes harder. If this ever regresses, a handler that looks correct stops being able to reply.
   */
  it('answers from inside an invoked actor', async () => {
    ask({ to: 'memo-pack/invoker', event: { type: 'PING', tag: 'invoked' }, sender: 'memo-pack/memos', client: 'c-main' });
    await untilBus(() => answers().length === 1, 'the answer from the invoked actor');

    expect(answers()).toEqual([
      { to: 'memo-pack/memos', event: { type: 'MEMO_ADDED', tag: 'invoked' }, sender: 'memo-pack/invoker', client: 'c-main' },
    ]);
  });

  /**
   * The ask with no connection, which is a system's, and the case this routing exists for.
   *
   * It used to be answered outward and read as correct — "the answer is then for every window, as before" —
   * which was wrong twice: the system that asked never got it, and because a feature's system and plugin share
   * one ref, a private answer went to that feature's plugin in every open window. `answered` is the asking
   * *system*; `answers()` is what the windows saw.
   */
  it('answers the asking system when the ask came from no connection', async () => {
    bus.send({ type: 'INCOMING', message: { to: 'memo-pack/asker', event: { type: 'GO' } } });
    await untilBus(() => answered.length === 1, 'the asking system to be answered');

    expect(answered, 'the system that asked has its answer').toEqual(['from-a-system']);
    expect(answers(), 'and no window was sent it').toEqual([]);
  });

  it('still answers outward when the ask came from a connection', async () => {
    ask({ to: 'memo-pack/memos', event: { type: 'PING', tag: 'from-a-window' }, sender: 'memo-pack/memos', client: 'c-main' });
    await untilBus(() => answers().length === 1, 'the answer to go out to the connection');

    expect(answers().map(({ client }) => client), 'one connection, not a broadcast').toEqual(['c-main']);
    expect(answered, 'and no system was sent it').toEqual([]);
  });
});

describe('a send made while handling says where an answer would go', () => {
  /**
   * `reply` sets `sender` itself, so it would pass with no stamping anywhere. This covers the other half: an
   * ordinary `broadcastToPlugin` made during a delivery carries the handler's own ref, which is what lets the
   * receiver answer *it* rather than having to be told. The stamp comes from the delivery because a pack's
   * generated sends know their pack and not which of its features called them.
   */
  it('stamps the handling feature, not the pack', async () => {
    ask({ to: 'memo-pack/memos', event: { type: 'ANNOUNCE' }, sender: 'memo-pack/memos', client: 'c-main' });
    await untilBus(() => outgoing.some(({ event }) => event.type === 'MEMOS_CONNECTED'), 'the announcement');

    const announced = outgoing.filter(({ event }) => event.type === 'MEMOS_CONNECTED');
    expect(announced).toHaveLength(1);
    expect(announced[0].sender, 'the feature\'s ref, where `from` would be the pack alone').toBe('memo-pack/memos');
  });

  // Outside a delivery there is nobody to answer, so the field is absent rather than guessed at
  it('stamps nothing on a send made outside any delivery', async () => {
    untypedBroadcastToPlugin('memo-pack/memos', { type: 'MEMOS_CONNECTED' });
    await untilBus(() => outgoing.some(({ event }) => event.type === 'MEMOS_CONNECTED'), 'the announcement');

    const announced = outgoing.filter(({ event }) => event.type === 'MEMOS_CONNECTED');
    expect(announced).toHaveLength(1);
    expect(announced[0].sender, 'nobody is being handled, so there is nobody to answer').toBeUndefined();
  });
});

describe('reply refuses rather than guessing', () => {
  // A private answer broadcast to every window is worse than an error, and silent
  it('throws when no message is being handled', () => {
    expect(() => reply({ type: 'MEMO_ADDED' })).toThrow(/no message being handled/);
  });

  it('throws when the message being handled named no sender', () => {
    expect(() => _runDelivery({ receiver: 'memo-pack/memos' }, () => reply({ type: 'MEMO_ADDED' })))
      .toThrow(/named no sender/);
  });

  // The error names the receiver, so a stack with several systems in it says which one had nothing to answer
  it('names the receiver it could not answer for', () => {
    expect(() => _runDelivery({ receiver: 'memo-pack/memos' }, () => reply({ type: 'MEMO_ADDED' })))
      .toThrow(/memo-pack\/memos/);
  });
});
