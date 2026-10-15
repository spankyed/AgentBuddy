import { describe, expect, it } from 'vitest';
import type { PackFERegistration, PluginDefinition } from '@apackdev/sdk/fe';
import type { StepDefinition } from '@apackdev/sdk/steps';
import { createFePackRegistry } from '../../src/fe/index.ts';

const plugin = (label: string) => ({ label, icon: 'x', state: {}, canvas: {} } as unknown as PluginDefinition);
const step = (type: string): StepDefinition => ({ type, kind: 'step', node: { label: type } });
const registration = (id: string, r: Partial<PackFERegistration>) => ({ id, ...r }) as PackFERegistration;

describe('a plugin', () => {
  // The registration names features and the registry addresses them, so no pack's plugin can be registered
  // in another pack's namespace, whatever the pack writes
  it("is registered at its feature's address", () => {
    const registry = createFePackRegistry();
    registry.registerPackFE(registration('memo-pack', { features: { memos: { plugin: plugin('Memos') } } }));
    expect(registry.getRegisteredPlugins().map((p) => p.id)).toEqual(['memo-pack/memos']);
  });

  // As the backend registry refuses them: a key with a `/` would land at another pack's ref, and `x` beside
  // `memo-pack/x` would register one plugin twice
  it('is refused when its key is no feature id, and nothing of the pack is registered', () => {
    const registry = createFePackRegistry();
    expect(() => registry.registerPackFE(registration('memo-pack', { features: { memos: { plugin: plugin('Memos') }, 'other-pack/notes': { plugin: plugin('Notes') } } })))
      .toThrow('Pack "memo-pack": feature "other-pack/notes" isn\'t a feature id');
    expect(registry.getRegisteredPlugins()).toEqual([]);
    expect(registry.unregisterPackFE('memo-pack')).toEqual([]);
  });
});

describe('a frontend registration that throws partway', () => {
  it('leaves the registry as it found it', () => {
    const registry = createFePackRegistry();
    registry.registerPackFE(registration('neighbour-pack', { features: { neighbour: { plugin: plugin('neighbour'), designation: 'occupied' } } }));

    expect(() => registry.registerPackFE(registration('partial-pack', { features: { ghost: { plugin: plugin('ghost'), designation: 'occupied' } }, artifacts: [{ type: 'ghost-view' }], steps: [step('ghost-step')] }))).toThrow(/Designation collision/);

    expect(registry.getRegisteredPlugins().map((p) => p.id), 'its plugin stayed in the list').toEqual(['neighbour-pack/neighbour']);
    expect(registry.step('ghost-step'), 'its step stayed registered').toBeUndefined();
    expect(registry.artifact('ghost-view'), 'its artifact stayed registered').toBeUndefined();
    expect(registry.unregisterPackFE('partial-pack'), 'it was recorded as registered').toEqual([]);
  });

  it("doesn't make its failure the next pack's", () => {
    const registry = createFePackRegistry();
    expect(() => registry.registerPackFE(registration('broken-pack', { steps: [step('theirs')], features: { first: { designation: 'duplicate' }, second: { designation: 'duplicate' } } }))).toThrow();

    expect(() => registry.registerPackFE(registration('later-pack', { features: { mine: { plugin: plugin('mine') } }, steps: [step('mine')] }))).not.toThrow();
    expect(registry.getRegisteredPlugins().map((p) => p.id)).toEqual(['later-pack/mine']);
  });

  it('gives back the default plugin it had taken', () => {
    const registry = createFePackRegistry();
    expect(() => registry.registerPackFE(registration('default-pack', { features: { first: { plugin: plugin('first'), default: true, designation: 'duplicate' }, second: { designation: 'duplicate' } }, steps: [step('boom')] }))).toThrow();

    expect(registry.defaultPlugin(), 'it kept the default plugin slot').toBeUndefined();
  });
});

// The backend registry refuses a pack id it already holds; this one used to overwrite what it had recorded,
// so the first registration's way back out was dropped and its plugins could never be removed.
describe('a pack registering its frontend twice', () => {
  it('is refused, as the backend registry refuses it', () => {
    const registry = createFePackRegistry();
    registry.registerPackFE(registration('twice-pack', { features: { once: { plugin: plugin('once') } } }));

    expect(() => registry.registerPackFE(registration('twice-pack', { features: { again: { plugin: plugin('again') } } })))
      .toThrow('Pack "twice-pack" frontend is already registered');

    expect(registry.unregisterPackFE('twice-pack').map((p) => p.id)).toEqual(['twice-pack/once']);
    expect(registry.getRegisteredPlugins()).toEqual([]);
  });
});
