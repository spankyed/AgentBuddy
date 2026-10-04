// The envelope crosses the tRPC boundary only because the input schema names its fields: zod strips what it isn't
// told about, and the outer object is not passthrough, so a field the schema omits arrives as `undefined` and the
// diagnostics written to name it can't. That is the whole path this covers — the schema, not the envelope.
//
// **The envelope has two kinds of field, and the schema is where they differ.** `to`, `event`, `from` and `via`
// come from the sender, so the schema names them. `client` is a return address that routes, so it is stamped
// from the connection instead, and the schema leaves it out. The stamped cases are in their own describe below;
// what each of them can and cannot catch is on the case, because the two halves of that defence overlap.
//
// Note that the last case, dropping a field nothing declares, passes just as happily while the dropped field is
// one the envelope *does* declare. It is not the guard for this; the `Required<…>` case is.
import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@abuddy/sdk/events';

const received: Message[] = [];
vi.mock('@abuddy/host/bus', () => ({
  receiveClientEvent: (_registry: unknown, message: Message) => { received.push(message); },
  UnknownClientEventError: class extends Error {},
}));
vi.mock('@/runtime', () => ({ appPacks: {} }));
vi.mock('@/transport/emitter', () => ({ rootEvents: { onOutgoing: () => () => {}, emitConnected: () => {}, emitPackClientConnected: () => {} } }));

const { systemBusRouter } = await import('@/transport/bus');

/** One connection's caller. `client` is the context the API mints per WebSocket connection. */
const callerFor = (client: string) => systemBusRouter.createCaller({ client } as never);
const caller = callerFor('c-one');

describe('bus.send carries the sender across the boundary', () => {
  /**
   * `Required<Omit<Message, 'client'>>` cannot be satisfied without naming every field a *sender* may set, so
   * this is one case rather than one per field, and it guards both halves: a field added to `Message` stops this
   * file compiling until it is named here (`npm run typecheck:be` covers these tests), and then fails the
   * assertion until `bus.send`'s schema names it too.
   *
   * `client` is omitted from the type deliberately — a new field that routes belongs in the stamped cases below
   * rather than here, and the `Omit` is what forces that choice to be made rather than defaulted into.
   */
  it('carries every field a sender may set, whatever the envelope grows', async () => {
    received.length = 0;
    const whole: Required<Omit<Message, 'client'>> = { to: 'memo-pack/memos', event: { type: 'ADD_MEMO' }, from: 'default-setup', via: 'action:Summarise' };
    await caller.send(whole);
    expect(received).toEqual([{ ...whole, client: 'c-one' }]);
  });

  // A partial envelope is the ordinary case, and the schema must not invent what it wasn't sent
  it('accepts a send with no sender, and adds none', async () => {
    received.length = 0;
    await caller.send({ to: 'memo-pack/memos', event: { type: 'ADD_MEMO' } });
    expect(received).toEqual([{ to: 'memo-pack/memos', event: { type: 'ADD_MEMO' }, client: 'c-one' }]);
  });

  // The fields are named rather than the object made passthrough, so the boundary stays closed to the rest
  it('still drops a field nothing declares', async () => {
    received.length = 0;
    await caller.send({ to: 'memo-pack/memos', event: { type: 'ADD_MEMO' }, spoofed: 'x' } as never);
    expect(received[0]).not.toHaveProperty('spoofed');
  });
});

describe('the return address comes from the connection, not the sender', () => {
  it('stamps the connection the send arrived on', async () => {
    received.length = 0;
    await callerFor('c-two').send({ to: 'memo-pack/memos', event: { type: 'ADD_MEMO' } });
    expect(received[0].client, 'the message says which connection to answer').toBe('c-two');
  });

  it('tells two connections apart', async () => {
    received.length = 0;
    await callerFor('c-two').send({ to: 'memo-pack/memos', event: { type: 'ADD_MEMO' } });
    await callerFor('c-three').send({ to: 'memo-pack/memos', event: { type: 'ADD_MEMO' } });
    expect(received.map((message) => message.client)).toEqual(['c-two', 'c-three']);
  });

  /**
   * The forgery case: a client that sends a `client` of its own must not be believed.
   *
   * **Two independent things stop it, and this case fires only when both are gone** — measured, not assumed.
   * `bus.send`'s input schema does not name `client`, so a supplied one is stripped; and the stamp is applied
   * as `{ ...input, client: ctx.client }`, so it overwrites whatever survived. Naming `client` in the schema
   * leaves this passing, and reversing the spread leaves it passing; doing both fails it. So this guards the
   * property rather than either mechanism, and the comment says so instead of crediting the wrong one.
   */
  it('ignores a client id the sender supplied', async () => {
    received.length = 0;
    await callerFor('c-two').send({ to: 'memo-pack/memos', event: { type: 'ADD_MEMO' }, client: 'c-someone-else' } as never);
    expect(received[0].client, 'the connection it arrived on, never the one it claimed').toBe('c-two');
  });
});
