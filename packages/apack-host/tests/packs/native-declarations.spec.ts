import { expect, it, vi } from 'vitest';
import type { NativePackDeclaration, PackRegistration } from '@apackdev/sdk/framework';
import { createPackRegistry } from '../../src/packs/registry.ts';

const definition = { schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false }, defaults: { name: 'Native' } };
const declaration: NativePackDeclaration = { id: 'native', dependencies: { provider: '*' },
  settings: { assistant: definition }, features: { notes: { description: 'Feature declaration fixture.', settings: definition } } };
const runtime = (): PackRegistration => ({ id: declaration.id, dependencies: declaration.dependencies,
  settings: structuredClone(declaration.settings), features: { notes: { settings: structuredClone(definition) } } });

it('discovers native data before binding and retains it after runtime unload or failure', () => {
  const input = structuredClone(declaration);
  const registry = createPackRegistry({ nativeDeclarations: [input] });
  const published = registry.catalog.getSnapshot();
  const changed = vi.fn();
  registry.onCatalogChanged(changed);
  expect(registry.loadedPacks()).toEqual([]);
  expect(published.native[0].features?.notes.description).toBe(declaration.features!.notes.description);
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
    features: { notes: { description: 'Feature declaration fixture.', entities: { NativeNote: 'src/types.ts#NoteShape', NativeIndex: null } } } }] });
  expect(registry.catalog.getSnapshot().native[0].features!.notes.entities).toEqual({
    NativeNote: 'src/types.ts#NoteShape', NativeIndex: null,
  });
  expect(() => registry.registerPack({ id: 'native', features: { notes: {} }, ears: { entities: {}, relKinds: {} } }))
    .toThrow('runtime does not match its admitted declarations');
  registry.registerPack({ id: 'native', features: { notes: {} },
    ears: { entities: { NativeNote: 'NativeNote', NativeIndex: 'NativeIndex' }, relKinds: {} } });
  expect(registry.earsNames().entities.NativeNote).toBe('NativeNote');
});

it('discovers native lifecycle targets without executing hooks and retains them after unload', () => {
  const onInit = vi.fn();
  const onShutdown = vi.fn();
  const lifecycle = { onInit: 'src/hooks.ts#onInit', onShutdown: 'src/hooks.ts#onShutdown' };
  const registry = createPackRegistry({ nativeDeclarations: [{ id: 'hooks', lifecycle }] });
  const before = registry.catalog.getSnapshot();
  registry.registerPack({ id: 'hooks', lifecycle: { onInit, onShutdown } });
  expect(onInit).not.toHaveBeenCalled();
  expect(onShutdown).not.toHaveBeenCalled();
  expect(registry.getLifecycleHooks()).toEqual([{ onInit, onShutdown }]);
  registry.unregisterPack('hooks');
  expect(registry.catalog.getSnapshot()).toBe(before);
  expect(before.native[0].lifecycle).toEqual(lifecycle);
  expect(registry.getLifecycleHooks()).toEqual([]);
});

it.each([
  [undefined, 'lifecycle'],
  [{ onInit: 1 }, 'lifecycle.onInit'],
  [{ onInit: () => {}, onShutdown: () => {} }, 'lifecycle'],
])('refuses native lifecycle bindings atomically: %j', (lifecycle, path) => {
  const registry = createPackRegistry({ nativeDeclarations: [{ id: 'hooks', lifecycle: { onInit: 'src/hooks.ts#onInit' } }] });
  const before = registry.catalog.getSnapshot();
  const changed = vi.fn();
  registry.onCatalogChanged(changed);
  expect(() => registry.registerPack({ id: 'hooks', lifecycle } as unknown as PackRegistration))
    .toThrow(`Native pack "hooks" runtime ${path} does not match its admitted declarations`);
  expect(registry.getPackRegistration('hooks')).toBeNull();
  expect(registry.getLifecycleHooks()).toEqual([]);
  expect(registry.catalog.getSnapshot()).toBe(before);
  expect(changed).not.toHaveBeenCalled();
});


it('rejects a blank native feature purpose before runtime admission', () => {
  const invalid = structuredClone(declaration);
  invalid.features!.notes.description = ' \n\t';
  expect(() => createPackRegistry({ nativeDeclarations: [invalid] }))
    .toThrow('Feature description must not be blank');
});

it('requires native feature purpose before publishing its declaration', () => {
  const invalid = structuredClone(declaration);
  Reflect.deleteProperty(invalid.features!.notes, 'description');
  expect(() => createPackRegistry({ nativeDeclarations: [invalid] })).toThrow(/description|Required/);
});
