// A client's event reaches the root event bus only when a registered system accepts its type, and is logged
// with long arrays summarized
import { resolveName } from '@abuddy/sdk/ids';
import { afterAll, describe, expect, it } from 'vitest';
import { setup } from 'xstate';
import { testRootEvents } from '@abuddy/sdk/testing';
import type { LogEvent } from '@abuddy/sdk/logger';
import '../packs/runtime/test-host.ts';
import { receiveClientEvent, UnknownClientEventError } from '../../src/bus/client-events.ts';
import { createPackRegistry } from '../../src/packs/pack-registration.ts';

const machine = setup({}).createMachine({});
const registry = createPackRegistry();
const { registerHostSystem, registerPack, unregisterPack } = registry;
registerHostSystem('client-events.host', machine, new Set(['PING']));
registerPack({ id: 'client-events-pack', systems: [{ id: resolveName('client-events-pack/any'), machine, events: new Set(['*']) }] });
afterAll(() => unregisterPack('client-events-pack'));

/** The incoming events and log events `run` produces */
function during(run: () => void): { incoming: unknown[]; logs: LogEvent[] } {
  const incoming: unknown[] = [];
  const logs: LogEvent[] = [];
  const stops = [testRootEvents.onIncoming((event) => { incoming.push(event); }), testRootEvents.onLog((event) => { logs.push(event); })];
  try {
    run();
  } finally {
    stops.forEach((stop) => stop());
  }
  return { incoming, logs };
}

describe('receiveClientEvent', () => {
  it('puts an accepted event on the bus and logs it', () => {
    const message = { to: 'client-events.host', event: { type: 'PING', note: 'hi' } };
    const { incoming, logs } = during(() => receiveClientEvent(registry, message));
    expect(incoming).toEqual([message]);
    expect(logs).toEqual([expect.objectContaining({ level: 'info', source: 'app-events', message: '→ Incoming: "PING"', meta: message })]);
  });

  it('accepts any type for a system that lists *', () => {
    const { incoming } = during(() => receiveClientEvent(registry, { to: 'client-events-pack/any', event: { type: 'ANYTHING' } }));
    expect(incoming).toEqual([{ to: 'client-events-pack/any', event: { type: 'ANYTHING' } }]);
  });

  it('logs arrays over 5 items as their count and first 5', () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const { logs } = during(() => receiveClientEvent(registry, { to: 'client-events.host', event: { type: 'PING', items } }));
    expect(logs[0].meta).toEqual({ to: 'client-events.host', event: { type: 'PING', items: { count: 7, sample: [1, 2, 3, 4, 5] } } });
  });

  it.each([
    [{ to: 'client-events.missing', event: { type: 'PING' } }, 'Unknown system: "client-events.missing"'],
    [{ to: 'client-events.host', event: { type: 'PONG' } }, 'Unknown event "PONG" for system "client-events.host"'],
  ])('rejects %o, sending and logging nothing', (event, message) => {
    const { incoming, logs } = during(() => {
      expect(() => receiveClientEvent(registry, event)).toThrow(new UnknownClientEventError(message));
    });
    expect(incoming).toEqual([]);
    expect(logs).toEqual([]);
  });
});
