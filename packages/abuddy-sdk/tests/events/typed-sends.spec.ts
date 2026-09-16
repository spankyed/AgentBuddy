// Compile-time checks of the typed sends, run by `tsc --noEmit` (npm run typecheck:sdk). The sends sit in
// functions that never run: only their types are checked.
import { describe, expectTypeOf, it } from 'vitest';
import type { TypedEmit, TypedSendToPlugin, TypedSendToSystem } from '../../src/events/index.ts';

type Systems = {
  memos:
    | { type: 'ADD_MEMO'; text: string }
    | { type: 'CLEAR_MEMOS' }
    // One member for several event types
    | { type: 'PIN_MEMO' | 'UNPIN_MEMO'; id: string }
    // A family of event types
    | { type: `memo.${string}`; payload: number }
    // Named fields beside an index signature
    | { type: 'TAG_MEMO'; tag: string; [field: string]: unknown };
  tags: { type: 'ADD_TAG'; name: string };
  labels: { type: 'LABEL_A'; label: 'a' } | { type: 'LABEL_B'; label: 'b' };
};

type Plugins = {
  memos: { type: 'MEMO_ADDED'; text: string } | { type: 'MEMOS_CLEARED' };
  tags: { type: 'TAG_ADDED'; name: string };
};

declare const sendToSystem: TypedSendToSystem<Systems>;
declare const sendToPlugin: TypedSendToPlugin<Plugins>;
declare const emit: TypedEmit<Plugins>;

describe('sendToSystem', () => {
  it('accepts each event the system receives', () => {
    expectTypeOf(() => {
      sendToSystem('memos', { type: 'ADD_MEMO', text: 'x' });
      sendToSystem('memos', { type: 'CLEAR_MEMOS' });
      sendToSystem('tags', { type: 'ADD_TAG', name: 'x' });
      sendToSystem('labels', { type: 'LABEL_A', label: 'a' });
    }).toBeFunction();
  });

  it('accepts an event whose type is one of a member\'s types', () => {
    expectTypeOf(() => {
      sendToSystem('memos', { type: 'PIN_MEMO', id: 'm1' });
      sendToSystem('memos', { type: 'UNPIN_MEMO', id: 'm1' });
      // @ts-expect-error PIN_MEMO needs its id
      sendToSystem('memos', { type: 'PIN_MEMO' });
    }).toBeFunction();
  });

  it('accepts an event whose type matches a template literal type', () => {
    expectTypeOf(() => {
      sendToSystem('memos', { type: 'memo.archived', payload: 1 });
      // @ts-expect-error a memo.* event needs its payload
      sendToSystem('memos', { type: 'memo.archived' });
    }).toBeFunction();
  });

  it('keeps the named fields of an event with an index signature', () => {
    expectTypeOf(() => {
      sendToSystem('memos', { type: 'TAG_MEMO', tag: 'x', extra: true });
      // @ts-expect-error TAG_MEMO needs its tag
      sendToSystem('memos', { type: 'TAG_MEMO' });
      // @ts-expect-error tag is a string
      sendToSystem('memos', { type: 'TAG_MEMO', tag: 1 });
    }).toBeFunction();
  });

  it('rejects an unknown system, an unknown event type and a missing field', () => {
    expectTypeOf(() => {
      // @ts-expect-error not a system of the map
      sendToSystem('nope', { type: 'CLEAR_MEMOS' });
      // @ts-expect-error the memos system doesn't receive this event
      sendToSystem('memos', { type: 'ADD_TAG', name: 'x' });
      // @ts-expect-error ADD_MEMO needs its text
      sendToSystem('memos', { type: 'ADD_MEMO' });
    }).toBeFunction();
  });

  it('checks an event type typed as a union against every event it names', () => {
    expectTypeOf((type: 'ADD_MEMO' | 'CLEAR_MEMOS', pin: 'PIN_MEMO' | 'CLEAR_MEMOS') => {
      sendToSystem('memos', { type, text: 'x' });
      sendToSystem('memos', { type: pin, id: 'm1' });
      // @ts-expect-error as an ADD_MEMO it would have no text
      sendToSystem('memos', { type });
      // @ts-expect-error as a PIN_MEMO it would have no id
      sendToSystem('memos', { type: pin });
    }).toBeFunction();
  });

  it('rejects an event type typed as a union whose events have conflicting fields', () => {
    expectTypeOf((kind: 'LABEL_A' | 'LABEL_B') => {
      // @ts-expect-error no event is both a LABEL_A and a LABEL_B
      sendToSystem('labels', { type: kind, label: 'a' });
    }).toBeFunction();
  });

  it('rejects a system id typed as a union, which would accept either system\'s events', () => {
    expectTypeOf((systemId: 'memos' | 'tags') => {
      // @ts-expect-error ADD_TAG isn't an event of the memos system
      sendToSystem(systemId, { type: 'ADD_TAG', name: 'x' });
    }).toBeFunction();
  });
});

describe('sendToPlugin and emit', () => {
  it('accept an event the plugin receives', () => {
    expectTypeOf(() => {
      sendToPlugin('memos', { type: 'MEMO_ADDED', text: 'x' });
      sendToPlugin('tags', { type: 'TAG_ADDED', name: 'x' });
    }).toBeFunction();
    expectTypeOf(() => emit('memos', { type: 'MEMOS_CLEARED' }).event.pluginId).returns.toEqualTypeOf<'memos'>();
  });

  it('reject an event the plugin does not receive and a missing field', () => {
    expectTypeOf(() => {
      // @ts-expect-error the memos plugin doesn't receive tag events
      sendToPlugin('memos', { type: 'TAG_ADDED', name: 'x' });
      // @ts-expect-error MEMO_ADDED needs its text
      emit('memos', { type: 'MEMO_ADDED' });
    }).toBeFunction();
  });

  it('reject a plugin id typed as a union, which would accept either plugin\'s events', () => {
    expectTypeOf((pluginId: 'memos' | 'tags') => {
      // @ts-expect-error TAG_ADDED isn't an event of the memos plugin
      sendToPlugin(pluginId, { type: 'TAG_ADDED', name: 'x' });
      // @ts-expect-error TAG_ADDED isn't an event of the memos plugin
      emit(pluginId, { type: 'TAG_ADDED', name: 'x' });
    }).toBeFunction();
  });
});
