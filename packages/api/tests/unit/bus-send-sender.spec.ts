// The sender crosses the tRPC boundary only because the input schema names its fields. zod strips what it isn't
// told about, and the outer object is not passthrough — so when `from` was added to the envelope without being
// added here, every send a pack's frontend made arrived with no sender, and the diagnostics written to name one
// could not. That is the whole path this covers: the schema, not the envelope. `via` is here for the same reason,
// and notice that the last case below — a field nothing declares is dropped — passes just as happily while the
// dropped field is one the envelope does declare. It is not the guard for this; the cases that name a field are.
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
  it('keeps `from` when the client sends one', async () => {
    received.length = 0;
    await caller.send({ to: 'memo-pack/memos', from: 'memo-pack', event: { type: 'ADD_MEMO' } });
    expect(received).toEqual([{ to: 'memo-pack/memos', from: 'memo-pack', event: { type: 'ADD_MEMO' } }]);
  });

  // An action's sends: the pack in `from`, the action in `via` (`createActionEmitter`)
  it('keeps `via` beside `from`', async () => {
    received.length = 0;
    await caller.send({ to: 'memo-pack/memos', from: 'default-setup', via: 'action:Summarise', event: { type: 'ADD_MEMO' } });
    expect(received).toEqual([{ to: 'memo-pack/memos', from: 'default-setup', via: 'action:Summarise', event: { type: 'ADD_MEMO' } }]);
  });

  it('accepts a send without one, absent being the ordinary case', async () => {
    received.length = 0;
    await caller.send({ to: 'memo-pack/memos', event: { type: 'ADD_MEMO' } });
    expect(received).toEqual([{ to: 'memo-pack/memos', event: { type: 'ADD_MEMO' } }]);
  });

  // The two are independent: a pack's own send stamps `from` alone, so `via` must not be required to carry it
  it('keeps `from` alone when there is no `via`', async () => {
    received.length = 0;
    await caller.send({ to: 'memo-pack/memos', from: 'memo-pack', event: { type: 'ADD_MEMO' } });
    expect(received[0]).not.toHaveProperty('via');
  });

  /**
   * The guard for the whole class, rather than for one field. `Required<Message>` cannot be satisfied without
   * naming every field of the envelope, so a field added to `Message` stops this spec **compiling** until it is
   * named here — and then fails the assertion until `bus.send`'s schema names it too. Neither of the two times
   * this went wrong had anything that would have noticed; the cases above are each one field's memory, and this
   * is the one that doesn't need to be remembered.
   */
  it('carries every field of the envelope, whatever the envelope grows', async () => {
    received.length = 0;
    const whole: Required<Message> = { to: 'memo-pack/memos', event: { type: 'ADD_MEMO' }, from: 'default-setup', via: 'action:Summarise' };
    await caller.send(whole);
    expect(received).toEqual([whole]);
  });

  // The field is named rather than the object made passthrough, so the boundary stays closed to the rest
  it('still drops a field nothing declares', async () => {
    received.length = 0;
    await caller.send({ to: 'memo-pack/memos', event: { type: 'ADD_MEMO' }, spoofed: 'x' } as never);
    expect(received[0]).not.toHaveProperty('spoofed');
  });
});
