// A pack's typed sends go through the bound app's bus, each system under the id it runs under, and each stamped
// with the pack that sent it. `defineEvents(packId)` is where a pack's own sends get their sender; an action's
// come from `createActionEmitter` instead, which stamps the pack running it and the action. What is left sending
// with no sender at all is the free sends, which `reportError` uses on behalf of a caller that is neither.
// Nothing routes or refuses on it: it is what lets a dropped message name who sent it.
import * as os from 'node:os';
import { describe, expect, it } from 'vitest';
import { defineEvents, untypedSendToSystem, type PluginEvents, type SystemEventMap } from '../../src/events/index.ts';
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

// The free sends are what `reportError` uses: it sends on behalf of whoever called it, which is a logger source
// (`'bus'`, `'action:x'`) and not a pack. They stamp nothing, and the shape says so: `from` is optional, and
// absent is a sender with nothing to declare rather than a fault.
describe('a send made outside a pack', () => {
  it('carries no sender', () => {
    expect(incoming(() => untypedSendToSystem('memo-pack/memos', { type: 'ADD_MEMO', text: 'x' })))
      .toEqual([{ to: 'memo-pack/memos', event: { type: 'ADD_MEMO', text: 'x' } }]);
  });
});

describe('defineEvents', () => {
  const events = defineEvents<Plugins, Systems>('memo-pack');

  it("sends to the pack's own system at its address", () => {
    expect(incoming(() => events.sendToSystem('memos', { type: 'ADD_MEMO', text: 'x' })))
      .toEqual([{ to: 'memo-pack/memos', event: { type: 'ADD_MEMO', text: 'x' }, from: 'memo-pack' }]);
  });

  it("sends to another pack's system, named <pack>/<feature>, at its address", () => {
    expect(incoming(() => events.sendToSystem('default-setup/settings', { type: 'GET_SETTINGS' })))
      .toEqual([{ to: 'default-setup/settings', event: { type: 'GET_SETTINGS' }, from: 'memo-pack' }]);
  });

  it('broadcasts to a plugin at its ref', () => {
    const outgoing: unknown[] = [];
    const stop = testRootEvents.onPluginSend((event) => outgoing.push(event));
    try {
      events.broadcastToPlugin('memos', { type: 'MEMO_ADDED' });
    } finally {
      stop();
    }
    expect(outgoing).toEqual([{ to: 'memo-pack/memos', event: { type: 'MEMO_ADDED' }, from: 'memo-pack' }]);
  });

  // The host is a pack: its plugins are named by ref, and a bare name is always this pack's own feature
  it("broadcasts to a host plugin by its ref, and takes a bare name as this pack's own", () => {
    const untyped = events.broadcastToPlugin as unknown as (name: string, event: { type: string }) => void;
    const sent: Array<{ to: string }> = [];
    const stop = testRootEvents.onPluginSend((message) => sent.push(message));
    try {
      untyped('host/application', { type: 'APPLICATION_HOTKEYS' });
      untyped('application', { type: 'APPLICATION_HOTKEYS' });
    } finally {
      stop();
    }
    expect(sent.map(({ to }) => to)).toEqual(['host/application', 'memo-pack/application']);
  });
});
