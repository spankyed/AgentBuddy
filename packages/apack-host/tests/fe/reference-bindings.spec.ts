import { describe, expect, it, vi } from 'vitest';
import type { NativePackDeclaration, ReferenceDeclarations } from '@apackdev/sdk/framework';
import type { ReferenceBindings } from '@apackdev/sdk/fe/references';
import { frontendBindingProblem } from '../../src/fe/declaration-binding.ts';
import { createFePackRegistry } from '../../src/fe/pack-store.ts';

function fixture(id = 'notes-pack', name = 'note', protocol = name, category = 'notes') {
  const geometry = [['path', { d: 'M2 6h4' }]] as const;
  const references: ReferenceDeclarations = {
    types: { [name]: { protocol, category, icon: 'NotebookText', svgElements: geometry, navigate: 'src/ref.ts#open' } },
    categories: { [category]: { label: category, icon: 'NotebookText', useItems: 'src/ref.ts#useItems' } },
  };
  const navigate = vi.fn();
  const useItems = vi.fn();
  const icon = { render: vi.fn() };
  const bindings: ReferenceBindings = {
    types: { [name]: { protocol, category, icon, svgElements: geometry, navigate } },
    categories: { [category]: { label: category, icon, useItems } },
  };
  const declaration: NativePackDeclaration = { id, features: { view: { references } } };
  return { declaration, registration: { id, features: { view: { references: bindings } } }, bindings, navigate, useItems, icon };
}

describe('frontend reference admission', () => {
  it('accepts complete metadata and bindings without executing providers, navigation or views', () => {
    const f = fixture();
    expect(frontendBindingProblem(f.declaration, f.registration)).toBeUndefined();
    const packs = createFePackRegistry({ nativeDeclarations: [f.declaration] });
    const pending = packs.preparePackFE(f.registration);
    expect(packs.referenceTypes().size).toBe(0);
    pending.commit();
    pending.dispose();
    expect(packs.referenceTypes().get('note')?.navigate).toBe(f.navigate);
    expect(packs.referenceCategories().get('notes')?.useItems).toBe(f.useItems);
    expect(f.navigate).not.toHaveBeenCalled();
    expect(f.useItems).not.toHaveBeenCalled();
    expect(f.icon.render).not.toHaveBeenCalled();
  });

  it.each([
    ['missing type', (b: ReferenceBindings) => { b.types = {}; }, 'references.types'],
    ['foreign type', (b: ReferenceBindings) => { b.types.ghost = b.types.note; }, 'references.types'],
    ['changed protocol', (b: ReferenceBindings) => { b.types.note.protocol = 'other'; }, 'references.types.note'],
    ['changed category', (b: ReferenceBindings) => { b.types.note.category = 'other'; }, 'references.types.note'],
    ['changed geometry', (b: ReferenceBindings) => { b.types.note.svgElements = [['path', { d: 'changed' }]]; }, 'svgElements'],
    ['missing geometry', (b: ReferenceBindings) => { b.types.note.svgElements = []; }, 'svgElements'],
    ['invalid navigation', (b: ReferenceBindings) => { b.types.note.navigate = {} as never; }, 'references.types.note'],
    ['changed label', (b: ReferenceBindings) => { b.categories.notes.label = 'Other'; }, 'references.categories.notes'],
    ['invalid provider', (b: ReferenceBindings) => { b.categories.notes.useItems = {} as never; }, 'references.categories.notes'],
    ['missing category', (b: ReferenceBindings) => { b.categories = {}; }, 'references.categories'],
  ] as const)('refuses %s before settings binding', (_label, change, path) => {
    const f = fixture();
    change(f.bindings);
    const bindSettings = vi.fn();
    const registration = { ...f.registration, bindSettings };
    const packs = createFePackRegistry({ nativeDeclarations: [f.declaration] });
    expect(frontendBindingProblem(f.declaration, registration)).toContain(path);
    expect(() => packs.registerPackFE(registration)).toThrow(path);
    expect(packs.referenceTypes().size).toBe(0);
    expect(bindSettings).not.toHaveBeenCalled();
  });

  it.each(['types', 'protocols', 'categories'])('rejects global %s collisions naming both owners, preserving the accepted pack', kind => {
    const first = fixture('first-pack');
    const second = fixture('second-pack', kind === 'types' ? 'note' : 'other', kind === 'protocols' ? 'note' : 'other', kind === 'categories' ? 'notes' : 'other');
    const packs = createFePackRegistry({ nativeDeclarations: [first.declaration, second.declaration] });
    packs.registerPackFE(first.registration);
    expect(() => packs.registerPackFE(second.registration)).toThrow(`Reference ${kind}`);
    expect(() => packs.registerPackFE(second.registration)).toThrow('"first-pack/view" and "second-pack/view"');
    expect(packs.referenceTypes().get('note')?.navigate).toBe(first.navigate);
    expect(packs.hasPackFE('second-pack')).toBe(false);
  });

  it('refuses a conflicting replacement before running its resources and retains incumbent references', () => {
    const packs = createFePackRegistry();
    const first = fixture('first-pack');
    const second = fixture('second-pack', 'other', 'other', 'other');
    packs.registerPackFE(first.registration);
    packs.registerPackFE(second.registration);
    const candidate = fixture('second-pack');
    const bindSettings = vi.fn();
    expect(() => packs.replacePackFE({ ...candidate.registration, bindSettings })).toThrow('Reference types');
    expect(bindSettings).not.toHaveBeenCalled();
    expect(packs.referenceTypes().get('other')?.navigate).toBe(second.navigate);
    expect(packs.referenceTypes().get('note')?.navigate).toBe(first.navigate);
  });

  it('retires old keys on replacement and releases keys on removal', () => {
    const packs = createFePackRegistry();
    const first = fixture('first-pack');
    packs.registerPackFE(first.registration);
    const replacement = fixture('first-pack', 'other', 'other', 'other');
    const prepared = packs.preparePackFE(replacement.registration, undefined, true);
    expect(packs.referenceTypes().has('note')).toBe(true);
    expect(packs.referenceTypes().has('other')).toBe(false);
    prepared.commit();
    prepared.dispose();
    expect(packs.referenceTypes().has('note')).toBe(false);
    expect(packs.referenceCategories().has('notes')).toBe(false);
    expect(packs.referenceTypes().get('other')?.navigate).toBe(replacement.navigate);
    packs.unregisterPackFE('first-pack');
    expect(packs.referenceTypes().size).toBe(0);
    expect(packs.referenceCategories().size).toBe(0);
    expect(() => packs.registerPackFE(fixture('new-pack', 'other', 'other', 'other').registration)).not.toThrow();
  });

  it('publishes current lookups once on commit/removal, and never for refusal or disposal', () => {
    const packs = createFePackRegistry();
    const observed: string[][] = [];
    const stop = packs.onChanged(() => observed.push([...packs.referenceTypes().keys()]));
    const first = fixture('first-pack');
    const abandoned = packs.preparePackFE(first.registration);
    abandoned.dispose();
    expect(observed).toEqual([]);
    packs.registerPackFE(first.registration);
    expect(observed).toEqual([['note']]);
    expect(() => packs.registerPackFE(fixture('second-pack').registration)).toThrow('Reference types');
    expect(observed).toEqual([['note']]);
    packs.unregisterPackFE('first-pack');
    expect(observed).toEqual([['note'], []]);
    stop();
    packs.registerPackFE(first.registration);
    expect(observed).toHaveLength(2);
  });

  it('checks the same captured metadata it publishes when authored fields have getters', () => {
    const f = fixture();
    let reads = 0;
    Object.defineProperty(f.bindings.types.note, 'protocol', { enumerable: true,
      get: () => ++reads === 1 ? 'note' : 'changed' });
    const packs = createFePackRegistry({ nativeDeclarations: [f.declaration] });
    packs.registerPackFE(f.registration);
    expect(packs.referenceTypes().get('note')?.protocol).toBe('note');
    expect(reads).toBe(1);
  });

  it('captures and freezes metadata so caller/reader mutation cannot change accepted identities', () => {
    const f = fixture();
    const packs = createFePackRegistry();
    packs.registerPackFE(f.registration);
    f.bindings.types.note.protocol = 'changed';
    f.bindings.categories.notes.label = 'Changed';
    const types = packs.referenceTypes();
    expect(types.get('note')?.protocol).toBe('note');
    expect(Reflect.set(types.get('note')!, 'protocol', 'mutated')).toBe(false);
    expect(Reflect.set(types.get('note')!.svgElements[0][1], 'd', 'mutated')).toBe(false);
    expect(packs.referenceCategories().get('notes')?.label).toBe('notes');
    (types as Map<string, unknown>).clear();
    expect(packs.referenceTypes().size).toBe(1);
  });
});
