// A pack's frontend registration runs the pack's own code — a step's `loadComponents` — so it can throw
// partway. What that must not do is leave the registry holding half a pack: nothing records what got in,
// so nothing can take it back out, and a step left broken by one pack would throw again for every pack
// registered after it.
import { describe, expect, it } from 'vitest';
import type { PackFERegistration, PluginDefinition } from '@abuddy/sdk/fe';
import type { StepDefinition } from '@abuddy/sdk/steps';
import { createFePackRegistry } from '../../src/fe/index.ts';

const plugin = (label: string) => ({ label, icon: 'x', state: {}, canvas: {} } as unknown as PluginDefinition);
/** A step whose components the pack fails to load, as a pack with a bad frontend bundle would have */
const unloadable = (type: string): StepDefinition =>
  ({ type, kind: 'step', fe: { loadComponents: () => { throw new Error(`${type} components are broken`); } } } as unknown as StepDefinition);
const registration = (id: string, r: Partial<PackFERegistration>) => ({ id, ...r }) as PackFERegistration;

describe('a plugin', () => {
  // The registration names features and the registry addresses them, so no pack's plugin can be registered
  // in another pack's namespace, whatever the pack writes
  it("is registered at its feature's address", () => {
    const registry = createFePackRegistry();
    registry.registerPackFE(registration('memo-pack', { plugins: { memos: plugin('Memos') } }));
    expect(registry.getRegisteredPlugins().map((p) => p.id)).toEqual(['memo-pack/memos']);
  });
});

describe('a frontend registration that throws partway', () => {
  it('leaves the registry as it found it', () => {
    const registry = createFePackRegistry();
    registry.registerPackFE(registration('neighbour-pack', { plugins: { neighbour: plugin('neighbour') } }));

    expect(() => registry.registerPackFE(registration('partial-pack', { plugins: { ghost: plugin('ghost') }, artifacts: [{ type: 'ghost-view' } as never], steps: [unloadable('ghost-step')] }))).toThrow('ghost-step components are broken');

    expect(registry.getRegisteredPlugins().map((p) => p.id), 'its plugin stayed in the list').toEqual(['neighbour-pack/neighbour']);
    expect(registry.step('ghost-step'), 'its step stayed registered').toBeUndefined();
    expect(registry.artifact('ghost-view'), 'its artifact stayed registered').toBeUndefined();
    expect(registry.unregisterPackFE('partial-pack'), 'it was recorded as registered').toEqual([]);
  });

  it("doesn't make its failure the next pack's", () => {
    const registry = createFePackRegistry();
    expect(() => registry.registerPackFE(registration('broken-pack', { steps: [unloadable('theirs')] }))).toThrow();

    expect(() => registry.registerPackFE(registration('later-pack', { plugins: { mine: plugin('mine') }, steps: [{ type: 'mine', kind: 'step' } as StepDefinition] }))).not.toThrow();
    expect(registry.getRegisteredPlugins().map((p) => p.id)).toEqual(['later-pack/mine']);
  });

  it('gives back the default plugin it had taken', () => {
    const registry = createFePackRegistry();
    expect(() => registry.registerPackFE(registration('default-pack', { plugins: { first: plugin('first') }, defaultPlugin: 'first', steps: [unloadable('boom')] }))).toThrow();

    expect(() => registry.getRegisteredDefaultPlugin(), 'it kept the default plugin slot').toThrow();
  });
});

// The backend registry refuses a pack id it already holds; this one used to overwrite what it had recorded,
// so the first registration's way back out was dropped and its plugins could never be removed.
describe('a pack registering its frontend twice', () => {
  it('is refused, as the backend registry refuses it', () => {
    const registry = createFePackRegistry();
    registry.registerPackFE(registration('twice-pack', { plugins: { once: plugin('once') } }));

    expect(() => registry.registerPackFE(registration('twice-pack', { plugins: { again: plugin('again') } })))
      .toThrow('Pack "twice-pack" frontend is already registered');

    expect(registry.unregisterPackFE('twice-pack').map((p) => p.id)).toEqual(['twice-pack/once']);
    expect(registry.getRegisteredPlugins()).toEqual([]);
  });
});
