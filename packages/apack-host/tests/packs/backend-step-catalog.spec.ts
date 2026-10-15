import { afterEach, expect, it, vi } from 'vitest';
import { startTestRuntime, resetTestData, nativePackDeclarationFixture } from '@apackdev/sdk/testing';
import { getStepBinding, getStepDeclaration, stepRegistry, type StepDefinition } from '@apackdev/sdk/steps';
import { captureStepBinding } from '../../src/packs/step-bindings.ts';
import { flowRepository } from '@apackdev/sdk/repositories';
import { _declarationRevision, type PackManifest } from '@apackdev/sdk/build';
import { createPackRegistry, type PackOrigin } from '../../src/packs/registry.ts';

// Backend reader tests use actual registry admission and an in-memory engine.
const registry = createPackRegistry();
startTestRuntime({ packs: registry });
afterEach(() => {
  if (registry.step('memo')) registry.unregisterPack('author');
  registry.catalog.setNative([]); registry.catalog.setSources([]); resetTestData();
});
function provider() {
  const handler = vi.fn(); const conditions = [{ label: 'First' }];
  const step: StepDefinition = { type: 'memo', node: { label: 'Memo', defaults: { conditions } }, runtime: { handler } };
  return { handler, conditions, step };
}

it('retains native declaration defaults after runtime unload without invoking the provider', () => {
  const f = provider(); const declaration = nativePackDeclarationFixture({ id: 'author', steps: [f.step] });
  registry.catalog.setNative([declaration]);
  registry.registerPack({ id: 'author', steps: [f.step] });
  const binding = getStepBinding('memo')!;
  expect(binding.packId).toBe('author'); expect(binding.runtimeRevision).toBeTruthy();
  expect(binding.declarationRevision).toBeUndefined(); expect(binding.buildRevision).toBeUndefined();
  registry.unregisterPack('author');
  expect(getStepDeclaration('memo')?.declaration.node.label).toBe('Memo');
  expect(stepRegistry.createNodeDefaults('memo')).toEqual({ nodeType: 'memo', label: 'Memo', conditions: [{ label: 'First' }] });
  expect(getStepBinding('memo')).toBeUndefined(); expect(f.handler).not.toHaveBeenCalled();
  const flow = flowRepository.createFlow();
  expect(() => flowRepository.createNode(flow.id, { nodeType: 'memo' })).toThrow('no active backend');
  expect(flowRepository.flowNodes(flow.id)).toEqual([]);
});

it('publishes a replacement runtime atomically and preserves the accepted provider after rejection', () => {
  const f = provider();
  registry.catalog.setNative([nativePackDeclarationFixture({ id: 'author', steps: [f.step] })]);
  registry.registerPack({ id: 'author', steps: [f.step] });
  const original = getStepBinding('memo')!;
  expect(() => registry.replacePack({ id: 'author', steps: [{ ...f.step, node: { label: 'Wrong' } }] }))
    .toThrow();
  expect(getStepBinding('memo')).toBe(original);
  const next = provider();
  registry.replacePack({ id: 'author', steps: [next.step] });
  const replaced = getStepBinding('memo')!;
  expect(replaced.runtimeRevision).not.toBe(original.runtimeRevision);
  expect(replaced.binding.runtime!.handler).toBe(next.handler);
  const flow = flowRepository.createFlow();
  expect(flowRepository.createNode(flow.id, { nodeType: 'memo' })).toMatchObject({ label: 'Memo', conditions: [{ label: 'First' }] });
  expect(f.handler).not.toHaveBeenCalled(); expect(next.handler).not.toHaveBeenCalled();
});

it('owns accepted source origin/declarations before caller mutation and refuses a later declaration revision', () => {
  const f = provider();
  const manifest: PackManifest = { id: 'author', name: 'Author', version: '1.0.0', extensions: { steps: {
    memo: { node: { label: 'Memo', defaults: { conditions: [{ label: 'First' }] } }, runtime: { handler: 'src/provider.ts#handler' } },
  } } };
  const revision = _declarationRevision(manifest);
  registry.catalog.setSources([{ manifest, dir: '/source/author', declarationRevision: revision }]);
  const origin: PackOrigin = { id: manifest.id, name: manifest.name, version: manifest.version, dir: '/source/author', declarationRevision: revision, manifest };
  registry.registerPack({ id: 'author', declarationRevision: revision, steps: [f.step] }, origin);
  const accepted = getStepBinding('memo')!;
  manifest.extensions!.steps!.memo.node.label = 'Mutated'; origin.declarationRevision = 'mutated';
  expect(getStepBinding('memo')).toBe(accepted);
  expect(registry.packOrigin('author')?.declarationRevision).toBe(revision);
  expect(registry.packOrigin('author')?.manifest?.extensions?.steps?.memo.node.label).toBe('Memo');
  const next = { ...manifest, extensions: { steps: { memo: { ...manifest.extensions!.steps!.memo, node: { label: 'Next' } } } } };
  registry.catalog.setSources([{ manifest: next, dir: origin.dir, declarationRevision: _declarationRevision(next) }]);
  expect(getStepBinding('memo')).toBeUndefined(); expect(stepRegistry.createNodeDefaults('memo').label).toBe('Next');
  expect(f.handler).not.toHaveBeenCalled();
});


it('owns relation and trigger data while retaining executable callback identity', () => {
  const compile = vi.fn(() => ({ entity: {}, relations: [] }));
  const validate = vi.fn(() => []);
  const compileTrigger = vi.fn(() => ({}));
  const relation = { field: 'memoId', targetEntity: 'Memo' };
  const queryFields = ['memoId'];
  const step: StepDefinition = { type: 'memo', build: {
    compile, validate, getLabel: () => 'Memo', relation,
  }, trigger: { trackField: 'memo', compile: compileTrigger, decompile: () => ({}), queryFields } };
  const accepted = captureStepBinding(step);
  relation.field = 'mutated'; queryFields.push('mutated');
  expect(accepted.build!.relation).toEqual({ field: 'memoId', targetEntity: 'Memo' });
  expect(accepted.trigger!.queryFields).toEqual(['memoId']);
  expect(Reflect.set(accepted.build!, 'compile', vi.fn())).toBe(false);
  expect(Reflect.set(accepted.trigger!, 'trackField', 'mutated')).toBe(false);
  expect(accepted.build!.compile).toBe(compile);
  expect(accepted.build!.validate).toBe(validate);
  expect(accepted.trigger!.compile).toBe(compileTrigger);
  expect(compile).not.toHaveBeenCalled(); expect(compileTrigger).not.toHaveBeenCalled();
});
