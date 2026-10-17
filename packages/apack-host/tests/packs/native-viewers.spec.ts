import { expect, it, vi } from 'vitest';
import type { NativePackDeclaration } from '@apackdev/sdk/framework';
import { createPackRegistry } from '../../src/packs/registry.ts';

const declaration: NativePackDeclaration = {
  id: 'native-viewers',
  artifacts: { card: { icon: 'File', fe: 'absent/Card.vue' } },
  blocks: { answer: { kind: 'input', be: 'absent/answer.ts#backend' } },
};

function binding() {
  return { id: declaration.id, artifacts: [{ type: 'card' }],
    blocks: [{ type: 'answer', kind: 'input' as const, be: { generateAsideText: vi.fn(() => 'Answer') } }],
  };
}

it('discovers native viewer metadata without modules, binds only backend facets and retains declarations after unload', () => {
  const registry = createPackRegistry({ nativeDeclarations: [declaration] });
  const artifacts = registry.catalog.artifacts();
  const blocks = registry.catalog.blocks();
  expect(artifacts).toMatchObject([{ type: 'card', origin: 'native', declaration: declaration.artifacts!.card }]);
  expect(blocks).toMatchObject([{ type: 'answer', origin: 'native', declaration: declaration.blocks!.answer }]);
  expect(registry.artifact('card')).toBeUndefined();
  expect(registry.block('answer')).toBeUndefined();
  const runtime = binding();
  registry.registerPack(runtime);
  expect(registry.artifact('card')).toBe(runtime.artifacts[0]);
  expect(registry.block('answer')).toBe(runtime.blocks[0]);
  expect(runtime.blocks[0].be.generateAsideText).not.toHaveBeenCalled();
  registry.unregisterPack(declaration.id);
  expect(registry.artifact('card')).toBeUndefined();
  expect(registry.block('answer')).toBeUndefined();
  expect(registry.catalog.artifacts()).toEqual(artifacts);
  expect(registry.catalog.blocks()).toEqual(blocks);
});

it.each([
  ['artifacts', { artifacts: [] }],
  ['artifacts', { artifacts: [{ type: 'card' }, { type: 'card' }] }],
  ['artifacts', { artifacts: [{ type: 'foreign' }] }],
  ['artifacts.card.fe', { artifacts: [{ type: 'card', fe: { icon: 'File' } }] }],
  ['blocks', { blocks: [] }],
  ['blocks', { blocks: [{ type: 'foreign' }] }],
  ['blocks.answer.kind', { blocks: [{ type: 'answer', be: {} }] }],
  ['blocks.answer.be', { blocks: [{ type: 'answer', kind: 'input' }] }],
  ['blocks.answer.be', { blocks: [{ type: 'answer', kind: 'input', be: null }] }],
  ['blocks.answer.be', { blocks: [{ type: 'answer', kind: 'input', be: [] }] }],
  ['blocks.answer.fe', { blocks: [{ type: 'answer', kind: 'input', be: {}, fe: { component: {} } }] }],
] as const)('refuses mismatched native %s before granting authority or publishing bindings', (path, changes) => {
  const registry = createPackRegistry({ nativeDeclarations: [declaration] });
  const before = registry.catalog.getSnapshot();
  const bindSettings = vi.fn();
  expect(() => registry.registerPack({ ...binding(), ...changes, bindSettings } as never))
    .toThrow(`Native pack "${declaration.id}" runtime ${path} does not match its admitted declarations`);
  expect(bindSettings).not.toHaveBeenCalled();
  expect(registry.getPackRegistration(declaration.id)).toBeNull();
  expect(registry.artifact('card')).toBeUndefined();
  expect(registry.block('answer')).toBeUndefined();
  expect(registry.catalog.getSnapshot()).toBe(before);
});

it('refuses a backend facet absent from the native declaration', () => {
  const registry = createPackRegistry({ nativeDeclarations: [{ id: 'display-only', blocks: { text: {} } }] });
  expect(() => registry.registerPack({ id: 'display-only', blocks: [{ type: 'text', be: {} }] }))
    .toThrow('blocks.text.be');
});
