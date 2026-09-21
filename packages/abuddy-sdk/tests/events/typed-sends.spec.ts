// Compile-time checks of the typed sends, run by `tsc --noEmit`: the sends sit in functions that never run.
import { describe, expectTypeOf, it } from 'vitest';
import type { TypedSendToPlugin, TypedSendToSystem } from '../../src/events/index.ts';

type Systems = {
  memos:
    | { type: 'ADD_MEMO'; text: string }
    | { type: 'CLEAR_MEMOS' }
    | { type: 'PIN_MEMO' | 'UNPIN_MEMO'; id: string }
    | { type: `memo.${string}`; payload: number }
    | { type: 'TAG_MEMO'; tag: string; [field: string]: unknown };
  tags: { type: 'ADD_TAG'; name: string };
};

type Plugins = {
  memos: { type: 'MEMO_ADDED'; text: string } | { type: 'MEMOS_CLEARED' };
  tags: { type: 'TAG_ADDED'; name: string };
};

declare const sendToSystem: TypedSendToSystem<Systems>;
declare const sendToPlugin: TypedSendToPlugin<Plugins>;

describe('sendToSystem', () => {
  it('checks the event its type names', () => {
    expectTypeOf(() => {
      sendToSystem('memos', { type: 'ADD_MEMO', text: 'x' });
      sendToSystem('memos', { type: 'CLEAR_MEMOS' });
      sendToSystem('tags', { type: 'ADD_TAG', name: 'x' });
      // A role names whichever system plays it, which the build can't know, so its event isn't checked
      sendToSystem({ role: 'brain' }, { type: 'TRIGGER_BRAIN_EVENT', eventType: 'x' });
      // @ts-expect-error ADD_MEMO needs its text
      sendToSystem('memos', { type: 'ADD_MEMO' });
      // @ts-expect-error the memos system doesn't receive ADD_TAG
      sendToSystem('memos', { type: 'ADD_TAG', name: 'x' });
      // @ts-expect-error not a system of the map
      sendToSystem('nope', { type: 'CLEAR_MEMOS' });
    }).toBeFunction();
  });

  it('sends a member whose type is a union or a template literal with one literal', () => {
    expectTypeOf(() => {
      sendToSystem('memos', { type: 'UNPIN_MEMO', id: 'm1' });
      sendToSystem('memos', { type: 'memo.archived', payload: 1 });
      // @ts-expect-error PIN_MEMO needs its id
      sendToSystem('memos', { type: 'PIN_MEMO' });
      // @ts-expect-error a memo.* event needs its payload
      sendToSystem('memos', { type: 'memo.archived' });
    }).toBeFunction();
  });

  it('keeps named fields beside an index signature', () => {
    expectTypeOf(() => {
      sendToSystem('memos', { type: 'TAG_MEMO', tag: 'x', extra: true });
      // @ts-expect-error TAG_MEMO needs its tag
      sendToSystem('memos', { type: 'TAG_MEMO' });
    }).toBeFunction();
  });

  it('rejects a union event type or a union system id', () => {
    expectTypeOf((type: 'ADD_MEMO' | 'CLEAR_MEMOS', systemId: 'memos' | 'tags') => {
      // @ts-expect-error one event type per send
      sendToSystem('memos', { type, text: 'x' });
      // @ts-expect-error one system per send
      sendToSystem(systemId, { type: 'ADD_TAG', name: 'x' });
    }).toBeFunction();
  });
});

describe('sendToPlugin', () => {
  it("check the plugin's events", () => {
    expectTypeOf(() => {
      sendToPlugin('memos', { type: 'MEMO_ADDED', text: 'x' });
      // @ts-expect-error the memos plugin doesn't receive TAG_ADDED
      sendToPlugin('memos', { type: 'TAG_ADDED', name: 'x' });
      // @ts-expect-error MEMO_ADDED needs its text
      sendToPlugin('memos', { type: 'MEMO_ADDED' });
    }).toBeFunction();
  });

  it('reject a union plugin id', () => {
    expectTypeOf((pluginId: 'memos' | 'tags') => {
      // @ts-expect-error one plugin per send
      sendToPlugin(pluginId, { type: 'TAG_ADDED', name: 'x' });
    }).toBeFunction();
  });
});
