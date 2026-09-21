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
      .toEqual([{ to: 'memo-pack/memos', event: { type: 'ADD_MEMO', text: 'x' } }]);
  });

  it("sends to another pack's system, named <pack>/<feature>, at its address", () => {
    expect(incoming(() => events.sendToSystem('default-setup/settings', { type: 'GET_SETTINGS' })))
      .toEqual([{ to: 'default-setup/settings', event: { type: 'GET_SETTINGS' } }]);
  });

  it('sends to a plugin at its address, and wraps an event for the bus with emit', () => {
    const outgoing: unknown[] = [];
    const stop = testRootEvents.onPluginSend((event) => outgoing.push(event));
    try {
      events.sendToPlugin('memos', { type: 'MEMO_ADDED' });
    } finally {
      stop();
    }
    expect(outgoing).toEqual([{ to: 'memo-pack/memos', event: { type: 'MEMO_ADDED' } }]);
    expect(events.emit('memos', { type: 'MEMO_ADDED' })).toEqual(emit('memo-pack/memos', { type: 'MEMO_ADDED' }));
  });

  // The host is a pack: its plugins are named by ref, and a bare name is always this pack's own feature
  it("sends to a host plugin by its ref, and takes a bare name as this pack's own", () => {
    const untyped = events.emit as unknown as (name: string, event: { type: string }) => { message: { to: string } };
    expect(untyped('host/application', { type: 'APPLICATION_HOTKEYS' }).message.to).toBe('host/application');
    expect(untyped('application', { type: 'APPLICATION_HOTKEYS' }).message.to).toBe('memo-pack/application');
  });
});
