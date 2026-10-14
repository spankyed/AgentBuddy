import { expect, it, vi } from 'vitest';
import type { NativePackDeclaration, PackRegistration } from '@apackdev/sdk/framework';
import { createPackRegistry } from '../../src/packs/registry.ts';

const definition = { schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false }, defaults: { name: 'Native' } };
const declaration: NativePackDeclaration = { id: 'native', dependencies: { provider: '*' },
  settings: { assistant: definition }, features: { notes: { settings: definition } } };
const runtime = (): PackRegistration => ({ id: declaration.id, dependencies: declaration.dependencies,
  settings: structuredClone(declaration.settings), features: { notes: { settings: structuredClone(definition) } } });

it('discovers native data before binding and retains it after runtime unload or failure', () => {
  const input = structuredClone(declaration);
  const registry = createPackRegistry({ nativeDeclarations: [input] });
  const published = registry.catalog.getSnapshot();
  const changed = vi.fn();
  registry.onCatalogChanged(changed);
  expect(registry.loadedPacks()).toEqual([]);
  expect(registry.settingsCatalog().features['native/notes']).toEqual(definition);
  input.features!.notes.settings!.defaults.name = 'Mutated input';
  expect(registry.settingsCatalog().features['native/notes'].defaults.name).toBe('Native');
  registry.registerPack(runtime());
  registry.unregisterPack('native');
  registry.recordLoadProblem('native', 'Activation failed');
  expect(registry.catalog.getSnapshot()).toBe(published);
  expect(registry.settingsCatalog().packs.native.assistant).toEqual(definition);
  expect(changed).not.toHaveBeenCalled();
  registry.catalog.setNative([]);
  expect(registry.settingsCatalog().features['native/notes']).toBeUndefined();
  expect(changed).toHaveBeenCalledOnce();
});

it('requires admission before binding, without inferring metadata from executable registration', () => {
  const registry = createPackRegistry();
  const previous = registry.catalog.getSnapshot();
  expect(() => registry.registerPack(runtime())).toThrow('must declare its data before binding');
  expect(registry.getPackRegistration('native')).toBeNull();
  expect(registry.catalog.getSnapshot()).toBe(previous);
});

it.each([
  { features: {} }, { features: { other: {} } }, { dependencies: {} }, { settings: {} },
  { features: { notes: { settings: { ...definition, defaults: { name: 'Different' } } } } },
  { dependencies: null }, { settings: null }, { features: null },
  { features: { notes: null } }, { features: { notes: [] } },
])('refuses mismatched native bindings before changing the catalog: %j', overrides => {
  const registry = createPackRegistry({ nativeDeclarations: [declaration] });
  const previous = registry.catalog.getSnapshot();
  expect(() => registry.registerPack({ ...runtime(), ...overrides } as PackRegistration)).toThrow('does not match its admitted declarations');
  expect(registry.getPackRegistration('native')).toBeNull();
  expect(registry.catalog.getSnapshot()).toBe(previous);
});

it('retains admitted metadata when a runtime contribution fails registration', () => {
  const registry = createPackRegistry({ nativeDeclarations: [declaration, { id: 'other' }] });
  registry.registerPack({ id: 'other', commands: [{ name: 'shared', placeholder: 'Existing' }] });
  const previous = registry.catalog.getSnapshot();
  expect(() => registry.registerPack({ ...runtime(), commands: [{ name: 'shared', placeholder: 'Conflicting' }] })).toThrow('Command collision');
  expect(registry.getPackRegistration('native')).toBeNull();
  expect(registry.catalog.getSnapshot()).toBe(previous);
  expect(registry.settingsCatalog().packs.native.assistant).toEqual(definition);
  registry.unregisterPack('other');
});

it.each([
  { id: 'native', features: null }, { id: 'native', settings: null },
  { id: 'native', features: { notes: null } }, { id: 'native', features: { notes: { settings: null } } },
  { id: 'native', dependencies: { provider: 1 } }, { id: 'native', dependencies: [] },
  { id: 'native', features: { 'invalid-name': {} } }, { id: 'native', unknown: true },
  { id: 'native', dependencies: JSON.parse('{"__proto__":"*"}') },
])('refuses malformed native data atomically: %j', invalid => {
  const registry = createPackRegistry({ nativeDeclarations: [declaration] });
  const previous = registry.catalog.getSnapshot();
  expect(() => registry.catalog.setNative([invalid as unknown as NativePackDeclaration])).toThrow('Invalid native declarations');
  expect(registry.catalog.getSnapshot()).toBe(previous);
});

it('admits native feature-owned entities statically and checks their runtime wire identities', () => {
  const registry = createPackRegistry({ nativeDeclarations: [{ id: 'native',
    features: { notes: { entities: { NativeNote: 'src/types.ts#NoteShape', NativeIndex: null } } } }] });
  expect(registry.catalog.getSnapshot().native[0].features!.notes.entities).toEqual({
    NativeNote: 'src/types.ts#NoteShape', NativeIndex: null,
  });
  expect(() => registry.registerPack({ id: 'native', features: { notes: {} }, ears: { entities: {}, relKinds: {} } }))
    .toThrow('runtime does not match its admitted declarations');
  registry.registerPack({ id: 'native', features: { notes: {} },
    ears: { entities: { NativeNote: 'NativeNote', NativeIndex: 'NativeIndex' }, relKinds: {} } });
  expect(registry.earsNames().entities.NativeNote).toBe('NativeNote');
});
