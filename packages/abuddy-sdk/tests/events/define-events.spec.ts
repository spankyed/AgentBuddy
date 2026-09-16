// A pack's typed sends go through the event transport the process registered: its own systems under the
// ids they run under, any other system as named.
import * as os from 'node:os';
import { describe, expect, it } from 'vitest';
import { defineEvents, emit, type PluginEvents, type SystemEventMap } from '../../src/events/index.ts';
import { startTestRuntime, testRootEvents } from '../../src/testing/index.ts';

process.env.ABUDDY_ENV ??= 'test';
process.env.ABUDDY_USER_DATA_DIR ??= os.tmpdir();
startTestRuntime();

type Plugins = PluginEvents & { memos: { type: 'MEMO_ADDED' } };
type Systems = SystemEventMap & { memos: { type: 'ADD_MEMO'; text: string }; settings: { type: 'GET_SETTINGS' } };

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
  const events = defineEvents<Plugins, Systems>({ memos: 'memo-pack.memos' });

  it("sends to the pack's own system under the id it runs under", () => {
    expect(incoming(() => events.sendToSystem('memos', { type: 'ADD_MEMO', text: 'x' })))
      .toEqual([{ type: 'ADD_MEMO', text: 'x', systemId: 'memo-pack.memos' }]);
  });

  it("sends to another pack's system as named", () => {
    expect(incoming(() => events.sendToSystem('settings', { type: 'GET_SETTINGS' })))
      .toEqual([{ type: 'GET_SETTINGS', systemId: 'settings' }]);
  });

  it("sends to a system named like an Object.prototype member as named, not the bus-id map's prototype", () => {
    const withProtoIds = defineEvents<Plugins, SystemEventMap & { toString: { type: 'PING' }; constructor: { type: 'PING' } }>({ memos: 'memo-pack.memos' });
    expect(incoming(() => {
      withProtoIds.sendToSystem('toString', { type: 'PING' });
      withProtoIds.sendToSystem('constructor', { type: 'PING' });
    })).toEqual([{ type: 'PING', systemId: 'toString' }, { type: 'PING', systemId: 'constructor' }]);
  });

  it('sends to a plugin', () => {
    const outgoing: unknown[] = [];
    const stop = testRootEvents.onOutgoing((event) => outgoing.push(event));
    try {
      events.sendToPlugin('memos', { type: 'MEMO_ADDED' });
    } finally {
      stop();
    }
    expect(outgoing).toEqual([{ type: 'MEMO_ADDED', pluginId: 'memos' }]);
  });

  it('wraps an event for the bus with emit', () => {
    expect(events.emit('memos', { type: 'MEMO_ADDED' })).toEqual(emit('memos', { type: 'MEMO_ADDED' }));
  });

  it('has no sendToSystem for a pack without systems', () => {
    expect(defineEvents<Plugins>()).not.toHaveProperty('sendToSystem');
  });
});
