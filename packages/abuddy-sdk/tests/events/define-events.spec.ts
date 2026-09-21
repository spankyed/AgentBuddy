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
  const events = defineEvents<Plugins, Systems>('memo-pack');

  it("sends to the pack's own system at its address", () => {
    expect(incoming(() => events.sendToSystem('memos', { type: 'ADD_MEMO', text: 'x' })))
      .toEqual([{ type: 'ADD_MEMO', text: 'x', systemId: 'memo-pack.memos' }]);
  });

  it("sends to another pack's system, named <pack>/<feature>, at its address", () => {
    expect(incoming(() => events.sendToSystem('default-setup/settings', { type: 'GET_SETTINGS' })))
      .toEqual([{ type: 'GET_SETTINGS', systemId: 'default-setup.settings' }]);
  });

  it('sends to a plugin at its address, and wraps an event for the bus with emit', () => {
    const outgoing: unknown[] = [];
    const stop = testRootEvents.onPluginSend((event) => outgoing.push(event));
    try {
      events.sendToPlugin('memos', { type: 'MEMO_ADDED' });
    } finally {
      stop();
    }
    expect(outgoing).toEqual([{ type: 'MEMO_ADDED', pluginId: 'memo-pack.memos' }]);
    expect(events.emit('memos', { type: 'MEMO_ADDED' })).toEqual(emit('memo-pack.memos', { type: 'MEMO_ADDED' }));
  });

  // Bare ids are the host's namespace, so a host plugin is never taken for one of this pack's features
  it("sends to a host plugin at its bare id", () => {
    const untyped = events.emit as unknown as (name: string, event: { type: string }) => { event: { pluginId: string } };
    expect(untyped('application', { type: 'APPLICATION_HOTKEYS' }).event.pluginId).toBe('application');
  });
});
