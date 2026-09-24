// `Message.from` crosses the tRPC boundary only because the input schema names it. zod strips what it isn't told
// about, and the outer object is not passthrough — so when `from` was added to the envelope without being added
// here, every send a pack's frontend made arrived with no sender, and the diagnostics written to name one could
// not. That is the whole path this covers: the schema, not the envelope.
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

  it('accepts a send without one, absent being the ordinary case', async () => {
    received.length = 0;
    await caller.send({ to: 'memo-pack/memos', event: { type: 'ADD_MEMO' } });
    expect(received).toEqual([{ to: 'memo-pack/memos', event: { type: 'ADD_MEMO' } }]);
  });

  // The field is named rather than the object made passthrough, so the boundary stays closed to the rest
  it('still drops a field nothing declares', async () => {
    received.length = 0;
    await caller.send({ to: 'memo-pack/memos', event: { type: 'ADD_MEMO' }, spoofed: 'x' } as never);
    expect(received[0]).not.toHaveProperty('spoofed');
  });
});
