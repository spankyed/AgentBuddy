import { createNativePackTestRegistry } from '@apackdev/host/testing';
import { expect, it } from 'vitest';
import { ManifestSchema } from '@apackdev/sdk/build';
import { backendBindingProblem } from '../../src/packs/declaration-binding.ts';

const manifest = ManifestSchema.parse({
  id: 'example', name: 'Example', version: '1.0.0',
  features: {
    notes: { description: 'Feature declaration fixture.',
      designation: 'notes', system: { entry: 'system.ts' },
      plugin: { label: 'Fixture', state: 'plugin.ts', defaultVisible: false },
      services: { notes: 'notes.ts#notes' }, repositories: { noteQueries: 'notes.ts#queries' },
    },
    preferences: { description: 'Feature declaration fixture.',},
  },
  extensions: { services: { shared: 'shared.ts#shared' } },
});

function binding() {
  return { features: {
    notes: { designation: 'notes', system: { machine: {} }, plugin: { defaultVisible: false }, services: ['notes'] },
    preferences: {},
  }, services: { notes: {}, shared: {} }, repositories: { noteQueries: {} } };
}

it('accepts exactly declared identities independently of registration order', () => {
  const registration = binding();
  registration.services = { shared: {}, notes: {} };
  expect(backendBindingProblem(manifest, registration)).toBeUndefined();
});

it.each([
  ['extra feature', (value: ReturnType<typeof binding>) => Object.assign(value.features, { ghost: {} }), 'features'],
  ['missing feature', (value: ReturnType<typeof binding>) => Reflect.deleteProperty(value.features, 'preferences'), 'features'],
  ['role', (value: ReturnType<typeof binding>) => { value.features.notes.designation = 'other'; }, 'features.notes.designation'],
  ['system', (value: ReturnType<typeof binding>) => Reflect.deleteProperty(value.features.notes, 'system'), 'features.notes.system'],
  ['plugin', (value: ReturnType<typeof binding>) => Reflect.deleteProperty(value.features.notes, 'plugin'), 'features.notes.plugin'],
  ['visibility', (value: ReturnType<typeof binding>) => { value.features.notes.plugin.defaultVisible = true; }, 'features.notes.plugin.defaultVisible'],
  ['feature service', (value: ReturnType<typeof binding>) => { value.features.notes.services = ['shared']; }, 'features.notes.services'],
  ['duplicate feature service', (value: ReturnType<typeof binding>) => { value.features.notes.services = ['notes', 'notes']; }, 'features.notes.services'],
  ['extra service', (value: ReturnType<typeof binding>) => Object.assign(value.services, { ghost: {} }), 'services'],
  ['missing service', (value: ReturnType<typeof binding>) => Reflect.deleteProperty(value.services, 'shared'), 'services'],
  ['extra repository', (value: ReturnType<typeof binding>) => Object.assign(value.repositories, { ghost: {} }), 'repositories'],
  ['missing repository', (value: ReturnType<typeof binding>) => Reflect.deleteProperty(value.repositories, 'noteQueries'), 'repositories'],
] as const)('refuses a mismatched %s and identifies the owner and contribution', (_name, change, path) => {
  const registration = binding();
  change(registration);
  expect(backendBindingProblem(manifest, registration)).toBe(`Pack "example" runtime ${path} does not match its accepted declarations`);
});

it.each([null, [], { features: [] }, { features: { notes: null, preferences: {} } }])('refuses malformed runtime records: %j', registration => {
  expect(backendBindingProblem(manifest, registration)).toBeDefined();
});

it.each(['features', 'services', 'repositories'])('refuses explicit null %s even when nothing is declared', key => {
  const empty = ManifestSchema.parse({ id: 'empty', name: 'Empty', version: '1.0.0' });
  expect(backendBindingProblem(empty, { [key]: null })).toContain(`runtime ${key}`);
  expect(backendBindingProblem(empty, {})).toBeUndefined();
});

it('refuses undeclared services before registration, catalog publication or authority binding', () => {
  const registry = createNativePackTestRegistry();
  const catalog = registry.settingsCatalog();
  let bound = false;
  const empty = ManifestSchema.parse({ id: 'undeclared', name: 'Undeclared', version: '1.0.0' });
  expect(() => registry.registerPack({ id: empty.id, services: { ghost: {} }, bindSettings: () => { bound = true; return () => {}; } }, {
    id: empty.id, name: empty.name, version: empty.version, dir: '/packs/undeclared',
    declarationRevision: 'accepted', manifest: empty,
  })).toThrow('runtime services does not match');
  expect(bound).toBe(false);
  expect(registry.getPackRegistration(empty.id)).toBeNull();
  expect(registry.getRegisteredServices()).not.toHaveProperty('ghost');
  expect(registry.settingsCatalog()).toBe(catalog);
});

it('checks native step data and runtime slots before granting settings or invoking functions', async () => {
  const { createPackRegistry } = await import('../../src/packs/registry.ts');
  const { vi } = await import('vitest');
  const handler = vi.fn();
  const bindSettings = vi.fn();
  const registry = createPackRegistry({ nativeDeclarations: [{ id: 'native', steps: {
    memo: { node: { label: 'Memo', defaults: { tags: ['draft'] } }, runtime: { handler: 'native.ts#run', waits: true } },
  } }] });
  const step = { type: 'memo', node: { label: 'Memo', defaults: { tags: ['draft'] } }, runtime: { handler, waits: true as const } };
  const candidates = [
    { steps: [] },
    { steps: [step, step] },
    { steps: [{ ...step, node: { label: 'Changed' } }] },
    { steps: [{ ...step, runtime: { handler } }] },
    { steps: [{ ...step, runtime: { waits: true as const } }] },
  ];
  for (const candidate of candidates) {
    expect(() => registry.registerPack({ id: 'native', ...candidate, bindSettings })).toThrow('does not match its admitted declarations');
    expect(registry.step('memo')).toBeUndefined();
  }
  expect(bindSettings).not.toHaveBeenCalled();
  expect(handler).not.toHaveBeenCalled();
  registry.registerPack({ id: 'native', steps: [step] });
  const accepted = registry.step('memo')!;
  expect(accepted.runtime!.handler).toBe(handler);
  step.node.defaults.tags.push('Caller mutation');
  Reflect.set(step.runtime, 'waits', false);
  expect(accepted.node!.defaults!.tags).toEqual(['draft']);
  expect(accepted.runtime!.waits).toBe(true);
  expect(handler).not.toHaveBeenCalled();
});

it('checks declared trigger registration slots without invoking their implementation', async () => {
  const { createPackRegistry } = await import('../../src/packs/registry.ts');
  const { vi } = await import('vitest');
  const register = vi.fn();
  const trigger = { trackField: 'event', compile: () => ({}), decompile: () => ({}) };
  const node = { label: 'Trigger' };
  for (const declared of [false, true]) {
    const registry = createPackRegistry({ nativeDeclarations: [{ id: 'native', steps: { signal: {
      kind: 'trigger', node, trigger: { facet: 'native.ts#trigger', ...(declared && { register: 'native.ts#register' }) },
    } } }] });
    const bound = { type: 'signal', kind: 'trigger' as const, node, trigger: { ...trigger, ...(!declared && { register }) } };
    expect(() => registry.registerPack({ id: 'native', steps: [bound] })).toThrow('trigger.register');
    registry.registerPack({ id: 'native', steps: [{ ...bound, trigger: { ...trigger, ...(declared && { register }) } }] });
    expect(register).not.toHaveBeenCalled();
  }
});

it('does not normalize non-JSON runtime node data into a matching declaration', async () => {
  const { createPackRegistry } = await import('../../src/packs/registry.ts');
  class NotJson { value = 1; }
  const registry = createPackRegistry({ nativeDeclarations: [{ id: 'native', steps: {
    memo: { node: { label: 'Memo', defaults: { object: { value: 1 } } } },
  } }] });
  expect(() => registry.registerPack({ id: 'native', steps: [{ type: 'memo',
    node: { label: 'Memo', defaults: { object: new NotJson() } },
  }] })).toThrow('JSON data');
  expect(registry.step('memo')).toBeUndefined();
});
