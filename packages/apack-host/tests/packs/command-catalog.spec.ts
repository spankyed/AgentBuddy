import { expect, it, vi } from 'vitest';
import { _declarationRevision, PACK_SNAPSHOT_FORMAT, type PackManifest } from '@apackdev/sdk/build';
import { createPackRegistry } from '../../src/packs/registry.ts';

function source(id: string, placeholder = 'Topic', enabled = true) {
  const manifest: PackManifest = { id, name: id, version: '1.0.0', extensions: { commands: { [id]: { placeholder } } } };
  return { dir: `/packs/${id}`, enabled, snapshot: { format: PACK_SNAPSHOT_FORMAT,
    declarationRevision: _declarationRevision(manifest), manifest, types: { entities: {}, relKinds: {} }, facades: {} } };
}

it('lists declarations without binding, retains stable declaration order and owns returned metadata', () => {
  const registry = createPackRegistry({ nativeDeclarations: [{ id: 'native', commands: { native: { placeholder: 'Native' } } }] });
  const first = source('first', 'First', false), second = source('second', 'Second');
  registry.catalog.replace([first, second]);
  const author = source('author');
  registry.catalog.setSources([{ manifest: author.snapshot.manifest, dir: '/source/author', declarationRevision: author.snapshot.declarationRevision }]);
  expect(registry.catalog.commands().map(command => command.name)).toEqual(['native', 'first', 'second', 'author']);
  expect(registry.catalog.commands()[1]).toMatchObject({ origin: 'installed', enabled: false, placeholder: 'First' });
  expect(registry.commands()).toEqual([]);
  first.snapshot.manifest.extensions!.commands!.first.placeholder = 'Caller mutation';
  expect(registry.catalog.commands()[1].placeholder).toBe('First');
  expect(Reflect.set(registry.catalog.commands()[1], 'placeholder', 'Reader mutation')).toBe(false);
  expect(registry.catalog.commands()[1].placeholder).toBe('First');
  registry.catalog.replace([second]);
  registry.catalog.replace([second, source('first', 'Revised')]);
  expect(registry.catalog.commands().map(command => command.name)).toEqual(['native', 'first', 'second', 'author']);
});

it('offers only enabled declarations matching an accepted runtime and refreshes on metadata changes', () => {
  const registry = createPackRegistry();
  const first = source('first');
  registry.catalog.replace([first]);
  const origin = { id: 'first', name: 'first', version: '1.0.0', dir: first.dir,
    declarationRevision: first.snapshot.declarationRevision, manifest: first.snapshot.manifest };
  registry.registerPack({ id: 'first', commands: [{ name: 'first', placeholder: 'Topic' }] }, origin);
  const changed = vi.fn();
  const stop = registry.onCatalogChanged(changed);
  expect(registry.commands()).toEqual([{ name: 'first', placeholder: 'Topic' }]);
  registry.commands()[0].placeholder = 'Reader mutation';
  expect(registry.commands()[0].placeholder).toBe('Topic');
  registry.catalog.replace([source('first', 'Topic', false)]);
  expect(registry.commands()).toEqual([]);
  expect(registry.catalog.commands()).toHaveLength(1);
  registry.catalog.replace([source('first', 'Updated')]);
  expect(registry.commands()).toEqual([]);
  registry.replacePack({ id: 'first', commands: [{ name: 'first', placeholder: 'Updated' }] }, {
    ...origin, manifest: source('first', 'Updated').snapshot.manifest,
    declarationRevision: source('first', 'Updated').snapshot.declarationRevision,
  });
  expect(registry.commands()).toEqual([{ name: 'first', placeholder: 'Updated' }]);
  registry.unregisterPack('first');
  registry.recordLoadProblem('first', 'Activation failed');
  expect(registry.commands()).toEqual([]);
  expect(registry.catalog.commands()[0].placeholder).toBe('Updated');
  expect(changed).toHaveBeenCalledTimes(2);
  stop();
  registry.catalog.replace([]);
  expect(changed).toHaveBeenCalledTimes(2);
});

it('refuses stale native command bindings while retaining discoverable metadata', () => {
  const registry = createPackRegistry({ nativeDeclarations: [{ id: 'native', commands: { run: { placeholder: 'Initial' } } }] });
  expect(() => registry.registerPack({ id: 'native' })).toThrow('does not match');
  expect(() => registry.registerPack({ id: 'native', commands: [{ name: 'run', placeholder: 'Wrong' }] })).toThrow('does not match');
  registry.registerPack({ id: 'native', commands: [{ name: 'run', placeholder: 'Initial' }] });
  registry.catalog.setNative([{ id: 'native', commands: { run: { placeholder: 'Updated' } } }]);
  expect(registry.commands()).toEqual([]);
  expect(registry.catalog.commands()[0].placeholder).toBe('Updated');
  registry.unregisterPack('native');
});

it('excludes a runtime from a replaced build even when its declarations have not changed', () => {
  const registry = createPackRegistry();
  const input = source('first');
  const integrity = { formatVersion: 1, id: 'first', version: '1.0.0', files: { 'runtime/index.cjs': 'a'.repeat(64) } };
  registry.catalog.replace([{ ...input, integrity }]);
  registry.registerPack({ id: 'first', commands: [{ name: 'first', placeholder: 'Topic' }] }, {
    id: 'first', name: 'first', version: '1.0.0', dir: input.dir, manifest: input.snapshot.manifest,
    declarationRevision: input.snapshot.declarationRevision, buildRevision: registry.catalog.get('first')!.buildRevision,
  });
  expect(registry.commands()).toHaveLength(1);
  registry.catalog.replace([{ ...input, integrity: { ...integrity, files: { 'runtime/index.cjs': 'b'.repeat(64) } } }]);
  expect(registry.commands()).toEqual([]);
  expect(registry.catalog.commands()).toHaveLength(1);
  registry.unregisterPack('first');
});
