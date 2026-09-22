// A plugin named by data opens only when it names a registered plugin: the runtime half of what the generated
// `navigateToPlugin` checks at compile time.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openPlugin } from '../../src/fe/navigation.ts';
import { bindFeHost, unbindFeHost } from '../../src/runtime/fe-host.ts';

let sent: unknown[];
/** What the memos plugin's actor received */
let received: unknown[];

beforeEach(() => {
  sent = [];
  received = [];
  const application = {
    getSnapshot: () => ({
      context: { plugins: [{ id: 'memo-pack/memos' }], activePlugin: { id: 'default-setup/threads' }, defaultToggles: { canvas: false } },
    }),
    send: (event: unknown) => sent.push(event),
    system: { get: (id: string) => (id === 'memo-pack/memos' ? { send: (event: unknown) => received.push(event) } : undefined) },
    subscribe: () => ({ unsubscribe() {} }),
  };
  bindFeHost({ application: application as never, secrets: {} as never, transport: { sendIncoming() {} }, packs: {} as never });
});

afterEach(() => unbindFeHost());

describe('openPlugin', () => {
  it('opens a registered plugin by its ref', () => {
    openPlugin('memo-pack/memos');
    expect(sent).toEqual([{ type: 'SELECT_PLUGIN', plugin: 'memo-pack/memos' }]);
  });

  it("hands the plugin's actor the events, in order", () => {
    openPlugin('memo-pack/memos', [{ type: 'OPEN_MEMO', id: 'm1' }, { type: 'FOCUS' }]);
    expect(received).toEqual([{ type: 'OPEN_MEMO', id: 'm1' }, { type: 'FOCUS' }]);
  });

  it('refuses a ref no plugin is registered at', () => {
    expect(() => openPlugin('memo-pack/memoz')).toThrow('No plugin is registered at "memo-pack/memoz"');
    expect(sent).toEqual([]);
  });

  it('refuses a name that is not a ref, rather than resolving it against some pack', () => {
    expect(() => openPlugin('memos')).toThrow('No plugin is registered at "memos"');
    expect(sent).toEqual([]);
  });
});
