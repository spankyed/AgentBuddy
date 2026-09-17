// A pack's typed sends go through the bound app's bus, each system under the id it runs under.
import * as os from 'node:os';
import { describe, expect, it } from 'vitest';
import { defineEvents, emit, type PluginEvents, type SystemEventMap } from '../../src/events/index.ts';
import { startTestRuntime, testRootEvents } from '../../src/testing/index.ts';

process.env.ABUDDY_ENV ??= 'test';
process.env.ABUDDY_USER_DATA_DIR ??= os.tmpdir();
startTestRuntime();

type Plugins = PluginEvents & { memos: { type: 'MEMO_ADDED' } };
type Systems = SystemEventMap & { memos: { type: 'ADD_MEMO'; text: string }; 'default-setup/settings': { type: 'GET_SETTINGS' } };

function incoming(send: () => void): unknown[] {
  const received: unknown[] = [];
  const stop = testRootEvents.onIncoming((event) => received.push(event));
  try {
    send();
  } finally {
    stop();
  }
  return received;
}

describe('defineEvents', () => {
  const events = defineEvents<Plugins, Systems>({ memos: 'memo-pack.memos', 'default-setup/settings': 'settings' });

  it("sends to the pack's own system under the id it runs under", () => {
    expect(incoming(() => events.sendToSystem('memos', { type: 'ADD_MEMO', text: 'x' })))
      .toEqual([{ type: 'ADD_MEMO', text: 'x', systemId: 'memo-pack.memos' }]);
  });

  it("sends to a dependency's system, named <dependency>/<feature>, under the id it runs under", () => {
    expect(incoming(() => events.sendToSystem('default-setup/settings', { type: 'GET_SETTINGS' })))
      .toEqual([{ type: 'GET_SETTINGS', systemId: 'settings' }]);
  });

  it("throws for a name the pack's map doesn't have, including Object.prototype members", () => {
    const untyped = events.sendToSystem as unknown as (name: string, event: { type: string }) => void;
    for (const name of ['settings', 'toString', 'constructor']) {
      expect(() => untyped(name, { type: 'PING' })).toThrow(`No system is named "${name}"`);
    }
  });

  it('sends to a plugin, and wraps an event for the bus with emit', () => {
    const outgoing: unknown[] = [];
    const stop = testRootEvents.onPluginSend((event) => outgoing.push(event));
    try {
      events.sendToPlugin('memos', { type: 'MEMO_ADDED' });
    } finally {
      stop();
    }
    expect(outgoing).toEqual([{ type: 'MEMO_ADDED', pluginId: 'memos' }]);
    expect(events.emit('memos', { type: 'MEMO_ADDED' })).toEqual(emit('memos', { type: 'MEMO_ADDED' }));
  });
});
