// An external pack's reference types reaching the app's editor. Nothing an external pack declared at
// `features.<id>.references` reached the app at all — `PackFERegistration` had no such member, and four docs
// said so — so the only reference types that existed were the shipped pack's, and the list of schemes the
// editor autolinks was those three written out by hand in `@apackdev/ui`. This holds that limit gone, from
// the manifest key through codegen to the registry whichever pack's editor reads.
//
// The store's own rules — two packs colliding on a type name or a scheme, and a pack's types going with it —
// are `@apackdev/host`'s, in `tests/fe/fe-registered-lookups.spec.ts`.
import { expect, it } from 'vitest';
import { startShell } from '@apackdev/testing/harness';
import { referenceRegistry } from '@apackdev/sdk/fe/references';
import { references } from '#generated/references.ts';
import memosState from '../../../../src/features/memos/fe/state.ts';

const startWithReferences = () => startShell({ plugins: { memos: { state: memosState } }, references });

it("registers the pack's declared reference types, categories and item providers", async () => {
  await startWithReferences();

  expect(referenceRegistry.type('memo')).toMatchObject({ protocol: 'memo', category: 'memos' });
  expect(referenceRegistry.categories().map((category) => category.id)).toContain('memos');
  expect(referenceRegistry.itemsProviders().map((provider) => provider.category)).toContain('memos');
});

// The list the editor autolinks with, which was `['note', 'thread', 'doc']` in `@apackdev/ui`: a pack's own
// scheme never linked, whatever it declared.
it("includes the pack's scheme in the protocols the editor recognises", async () => {
  await startWithReferences();

  expect(referenceRegistry.protocols()).toContain('memo');
});

// A reference carries its type name and the type names its scheme, which are different facts — the shipped
// pack's `document` type uses `doc://` — so the pack declares both and both are read back
it('keeps the type name and the scheme as the two facts they are', async () => {
  await startWithReferences();

  expect(Object.keys(references.types)).toEqual(['memo']);
  expect(referenceRegistry.type('memo')!.protocol).toBe('memo');
  expect(referenceRegistry.type('memo')!.navigate).toBeTypeOf('function');
});
