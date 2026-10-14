import { afterEach, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';
import { bindFeHost, unbindFeHost } from '../../src/runtime/fe-host.ts';
import type { PackCatalogView, ReferenceCatalogEntry } from '../../src/framework/catalog-view.ts';
import type { ReferenceBinding, ReferenceBindings, ReferenceTypeConfig } from '../../src/fe/reference-types.ts';
import { findReferenceTypeByProtocol, getReferenceCategoryBinding, getReferenceCategoryDeclarations, getReferenceTypeBinding, getReferenceTypeDeclaration,
  onReferenceBindingsChanged, onReferenceDeclarationsChanged } from '../../src/fe/reference-types.ts';
import { resolveName } from '../../src/ids/refs.ts';

afterEach(unbindFeHost);

function fixture() {
  const featureRef = resolveName('notes', 'author');
  const entry: ReferenceCatalogEntry = { packId: 'author', featureRef, origin: 'installed', enabled: true,
    declarationRevision: 'declaration-one', artifactRevision: 'artifact-one', declaration: {
      types: { note: { protocol: 'note', category: 'notes', icon: 'NotebookText', svgElements: [], navigate: 'src/ref.ts#open' } },
      categories: { notes: { label: 'Notes', icon: 'NotebookText', useItems: 'src/ref.ts#useItems' } },
    } };
  const icon = { render: vi.fn() }; const navigate = vi.fn(); const useItems = vi.fn(() => shallowRef([]));
  const identity = { featureRef, declarationRevision: entry.declarationRevision, artifactRevision: entry.artifactRevision, runtimeRevision: 'runtime-one' };
  const type: ReferenceBinding<ReferenceTypeConfig> = { ...identity, binding: { protocol: 'note', category: 'notes', svgElements: [], icon, navigate } };
  const category: ReferenceBinding<ReferenceBindings['categories'][string]> = { ...identity, binding: { label: 'Notes', icon, useItems } };
  const state: { status: ReturnType<PackCatalogView['status']>; entries: ReferenceCatalogEntry[] } = { status: 'ready', entries: [entry] };
  const declarations = new Set<() => void>(); const bindings = new Set<() => void>();
  const types = new Map([['note', type]]); const categories = new Map([['notes', category]]);
  bindFeHost({ application: {} as never, settings: {} as never, secrets: {} as never, client: {} as never,
    catalog: { status: () => state.status, problem: () => undefined, references: () => state.entries,
      subscribe(listener) { declarations.add(listener); return () => { declarations.delete(listener); }; } },
    packs: { referenceTypes: () => types, referenceCategories: () => categories,
      onChanged(listener: () => void) { bindings.add(listener); return () => { bindings.delete(listener); }; } } as never });
  return { entry, type, category, state, types, categories, navigate, useItems, icon, declarations, bindings };
}

it('returns stable accepted entries without calling navigation, providers or icons', () => {
  const f = fixture();
  expect(getReferenceTypeDeclaration('note')).toBe(f.entry.declaration.types.note);
  expect(getReferenceCategoryDeclarations()).toMatchObject([{ id: 'notes', featureRef: 'author/notes', declaration: { label: 'Notes' } }]);
  expect(getReferenceTypeBinding('note')).toBe(f.type);
  expect(getReferenceCategoryBinding('notes')).toBe(f.category);
  expect(getReferenceTypeBinding('note')).toBe(f.type);
  expect(f.navigate).not.toHaveBeenCalled(); expect(f.useItems).not.toHaveBeenCalled(); expect(f.icon.render).not.toHaveBeenCalled();
});

it.each(['loading', 'disconnected', 'error', 'disposed'] as const)('refuses execution while %s, retaining metadata', status => {
  const f = fixture(); f.state.status = status;
  expect(getReferenceTypeBinding('note')).toBeUndefined(); expect(getReferenceCategoryBinding('notes')).toBeUndefined();
  expect(getReferenceTypeDeclaration('note')).toBe(f.entry.declaration.types.note);
  expect(getReferenceCategoryDeclarations()).toHaveLength(1);
});

it.each([
  ['disabled', { enabled: false }], ['missing enablement', { enabled: undefined }],
  ['new declarations', { declarationRevision: 'declaration-two' }], ['missing declaration stamp', { declarationRevision: undefined }],
  ['new artifact', { artifactRevision: 'artifact-two' }], ['missing artifact receipt', { artifactRevision: undefined }],
  ['foreign owner', { featureRef: resolveName('notes', 'other') }], ['source only', { origin: 'source' as const }],
])('refuses %s for both executable groups', (_name, change) => {
  const f = fixture(); f.state.entries = [{ ...f.entry, ...change }];
  expect(getReferenceTypeBinding('note')).toBeUndefined(); expect(getReferenceCategoryBinding('notes')).toBeUndefined();
  expect(getReferenceCategoryDeclarations()).toHaveLength(1);
});

it('refuses installed bindings without a runtime identity', () => {
  const f = fixture(); f.types.set('note', { ...f.type, runtimeRevision: undefined }); f.categories.set('notes', { ...f.category, runtimeRevision: undefined });
  expect(getReferenceTypeBinding('note')).toBeUndefined(); expect(getReferenceCategoryBinding('notes')).toBeUndefined();
});

it('admits native bindings without manufacturing installed receipts and refuses stamped impostors', () => {
  const f = fixture(); f.state.entries = [{ ...f.entry, origin: 'native', declarationRevision: undefined, artifactRevision: undefined }];
  const type = { ...f.type, declarationRevision: undefined, artifactRevision: undefined, runtimeRevision: undefined };
  const category = { ...f.category, declarationRevision: undefined, artifactRevision: undefined, runtimeRevision: undefined };
  f.types.set('note', type); f.categories.set('notes', category);
  expect(getReferenceTypeBinding('note')).toBe(type); expect(getReferenceCategoryBinding('notes')).toBe(category);
  f.types.set('note', f.type); f.categories.set('notes', f.category);
  expect(getReferenceTypeBinding('note')).toBeUndefined(); expect(getReferenceCategoryBinding('notes')).toBeUndefined();
});

it('does not treat a source advertisement as a second runtime claim', () => {
  const f = fixture(); f.state.entries.push({ ...f.entry, origin: 'source', enabled: undefined, artifactRevision: undefined });
  expect(getReferenceTypeBinding('note')).toBe(f.type); expect(getReferenceCategoryBinding('notes')).toBe(f.category);
  expect(getReferenceCategoryDeclarations()).toHaveLength(2);
});

it('preserves category owners and refuses ambiguous runtime names instead of silently choosing a pack', () => {
  const f = fixture(); f.state.entries.push({ ...f.entry, packId: 'other', featureRef: resolveName('notes', 'other'), enabled: false });
  expect(getReferenceCategoryDeclarations().map(category => category.featureRef)).toEqual(['author/notes', 'other/notes']);
  expect(getReferenceTypeDeclaration('note')).toBeUndefined();
  expect(getReferenceTypeBinding('note')).toBeUndefined(); expect(getReferenceCategoryBinding('notes')).toBeUndefined();
});

it('drops removed declarations or bindings and follows the replacement entry', () => {
  const f = fixture(); f.state.entries = [];
  expect(getReferenceTypeBinding('note')).toBeUndefined(); expect(getReferenceCategoryDeclarations()).toEqual([]);
  f.state.entries = [f.entry]; f.types.clear(); f.categories.clear();
  expect(getReferenceTypeBinding('note')).toBeUndefined(); expect(getReferenceCategoryBinding('notes')).toBeUndefined();
  const replacement = { ...f.type, runtimeRevision: 'runtime-two' }; f.types.set('note', replacement);
  expect(getReferenceTypeBinding('note')).toBe(replacement);
  expect(getReferenceTypeBinding('unknown')).toBeUndefined(); expect(getReferenceCategoryBinding('toString')).toBeUndefined();
});

it('observes declaration and binding publications independently and releases both listeners', () => {
  const f = fixture(); const changed = vi.fn();
  const stopDeclarations = onReferenceDeclarationsChanged(changed); const stopBindings = onReferenceBindingsChanged(changed);
  for (const listener of f.declarations) listener(); for (const listener of f.bindings) listener();
  expect(changed).toHaveBeenCalledTimes(2);
  stopDeclarations(); stopBindings(); expect(f.declarations.size).toBe(0); expect(f.bindings.size).toBe(0);
});

it('resolves current protocols without execution and ignores conflicting authoring advertisements', () => {
  const f = fixture();
  expect(findReferenceTypeByProtocol('note')).toBe('note');
  expect(findReferenceTypeByProtocol('unknown')).toBeUndefined();
  f.state.entries.push({ ...f.entry, origin: 'source', declaration: { ...f.entry.declaration,
    types: { alternate: { ...f.entry.declaration.types.note } } } });
  expect(findReferenceTypeByProtocol('note')).toBe('note');
  expect(f.navigate).not.toHaveBeenCalled(); expect(f.useItems).not.toHaveBeenCalled();
  f.state.entries = [{ ...f.entry, declaration: { ...f.entry.declaration, types: { note: { ...f.entry.declaration.types.note, protocol: 'changed' } } } }];
  expect(findReferenceTypeByProtocol('note')).toBeUndefined(); expect(findReferenceTypeByProtocol('changed')).toBe('note');
});

it('refuses distinct types claiming one protocol rather than choosing insertion order', () => {
  const f = fixture();
  f.state.entries.push({ ...f.entry, featureRef: resolveName('other', 'other'), declaration: { ...f.entry.declaration,
    types: { alternate: { ...f.entry.declaration.types.note } } } });
  expect(findReferenceTypeByProtocol('note')).toBeUndefined();
});
