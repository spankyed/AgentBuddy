// The envelope crosses the tRPC boundary only because the input schema names its fields: zod strips what it isn't
// told about, and the outer object is not passthrough, so a field the schema omits arrives as `undefined` and the
// diagnostics written to name it can't. That is the whole path this covers — the schema, not the envelope.
//
// Note that the last case, dropping a field nothing declares, passes just as happily while the dropped field is
// one the envelope *does* declare. It is not the guard for this; the `Required<Message>` case is.
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
const caller = systemBusRouter.createCaller({} as never);

describe('bus.send carries the sender across the boundary', () => {
  /**
   * `Required<Message>` cannot be satisfied without naming every field of the envelope, so this is one case
   * rather than one per field, and it guards both halves: a field added to `Message` stops this file compiling
   * until it is named here (`npm run typecheck:be` covers these tests), and then fails the assertion until
   * `bus.send`'s schema names it too.
   */
  it('carries every field of the envelope, whatever the envelope grows', async () => {
    received.length = 0;
    const whole: Required<Message> = { to: 'memo-pack/memos', event: { type: 'ADD_MEMO' }, from: 'default-setup', via: 'action:Summarise' };
    await caller.send(whole);
    expect(received).toEqual([whole]);
  });

  // A partial envelope is the ordinary case, and the schema must not invent what it wasn't sent
  it('accepts a send with no sender, and adds none', async () => {
    received.length = 0;
    await caller.send({ to: 'memo-pack/memos', event: { type: 'ADD_MEMO' } });
    expect(received).toEqual([{ to: 'memo-pack/memos', event: { type: 'ADD_MEMO' } }]);
  });

  // The fields are named rather than the object made passthrough, so the boundary stays closed to the rest
  it('still drops a field nothing declares', async () => {
    received.length = 0;
    await caller.send({ to: 'memo-pack/memos', event: { type: 'ADD_MEMO' }, spoofed: 'x' } as never);
    expect(received[0]).not.toHaveProperty('spoofed');
  });
});
