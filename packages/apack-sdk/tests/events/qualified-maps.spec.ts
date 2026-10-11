// Every generated send map is keyed by ref; a pack's own code names its own features by feature id instead
import { expectTypeOf, it } from 'vitest';
import type { Qualified, WithOwnNames } from '../../src/events/index.ts';

type Own = { memos: { type: 'MEMO_ADDED' } };
type Host = { 'host/application': { type: 'APPLICATION_HOTKEYS' } };

it("keys a pack's map by ref", () => {
  expectTypeOf<Qualified<'memo-pack', Own>>().toEqualTypeOf<{ 'memo-pack/memos': { type: 'MEMO_ADDED' } }>();
});

it("names the pack's own features by feature id, and every other by ref", () => {
  type Sendable = WithOwnNames<'memo-pack', Qualified<'memo-pack', Own> & Host>;
  expectTypeOf<keyof Sendable>().toEqualTypeOf<'host/application' | 'memos'>();
  expectTypeOf<Sendable['memos']>().toEqualTypeOf<{ type: 'MEMO_ADDED' }>();
});
