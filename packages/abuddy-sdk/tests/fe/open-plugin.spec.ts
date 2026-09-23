// openPlugin asks the shell to open a plugin (OPEN_PLUGIN), since only the shell knows whether a pack's frontend
// that could provide it is still loading; the host's shell specs cover what it does with the request. What openPlugin
// refuses itself is a string that isn't a ref at all.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openPlugin } from '../../src/fe/navigation.ts';
import { bindFeHost, unbindFeHost } from '../../src/runtime/fe-host.ts';

let sent: unknown[];

beforeEach(() => {
  sent = [];
  const application = {
    getSnapshot: () => ({ context: {}, hasTag: () => false }),
    send: (event: unknown) => sent.push(event),
    system: { get: () => undefined },
    subscribe: () => ({ unsubscribe() {} }),
  };
  bindFeHost({ application: application as never, secrets: {} as never,
    settings: {} as never, client: { send() {} }, packs: {} as never });
});

afterEach(() => unbindFeHost());

describe('openPlugin', () => {
  it('asks the shell to open the plugin at a ref', () => {
    openPlugin('memo-pack/memos');
    expect(sent).toEqual([{ type: 'OPEN_PLUGIN', plugin: 'memo-pack/memos', events: [] }]);
  });

  it('hands the shell the events for the plugin, in order, one or several', () => {
    openPlugin('memo-pack/memos', { type: 'OPEN_MEMO', id: 'm1' });
    openPlugin('memo-pack/memos', [{ type: 'OPEN_MEMO', id: 'm1' }, { type: 'FOCUS' }]);
    expect(sent).toEqual([
      { type: 'OPEN_PLUGIN', plugin: 'memo-pack/memos', events: [{ type: 'OPEN_MEMO', id: 'm1' }] },
      { type: 'OPEN_PLUGIN', plugin: 'memo-pack/memos', events: [{ type: 'OPEN_MEMO', id: 'm1' }, { type: 'FOCUS' }] },
    ]);
  });

  it('refuses a name that is not a ref, rather than resolving it against some pack', () => {
    expect(() => openPlugin('memos')).toThrow(`"memos" doesn't name a plugin`);
    expect(sent).toEqual([]);
  });
});
