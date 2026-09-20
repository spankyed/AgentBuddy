// A pack's frontend registration runs the pack's own code — a step's `loadComponents` — so it can throw
// partway. What that must not do is leave the registry holding half a pack: nothing records what got in,
// so nothing can take it back out, and a step left broken by one pack would throw again for every pack
// registered after it.
import { describe, expect, it } from 'vitest';
import type { PackFERegistration, Plugin } from '@abuddy/sdk/fe';
import type { StepDefinition } from '@abuddy/sdk/steps';
import { createFePackRegistry } from '../../src/fe/index.ts';

const plugin = (id: string) => ({ id, label: id, icon: 'x', state: {}, canvas: {} } as unknown as Plugin);
/** A step whose components the pack fails to load, as a pack with a bad frontend bundle would have */
const unloadable = (type: string): StepDefinition =>
  ({ type, kind: 'step', fe: { loadComponents: () => { throw new Error(`${type} components are broken`); } } } as unknown as StepDefinition);
const registration = (r: Partial<PackFERegistration>) => r as PackFERegistration;

describe('a frontend registration that throws partway', () => {
  it('leaves the registry as it found it', () => {
    const registry = createFePackRegistry();
    registry.registerPackFE(registration({ plugins: [plugin('neighbour')] }), 'neighbour-pack');

    expect(() => registry.registerPackFE(
      registration({ plugins: [plugin('ghost')], artifacts: [{ type: 'ghost-view' } as never], steps: [unloadable('ghost-step')] }),
      'partial-pack',
    )).toThrow('ghost-step components are broken');

    expect(registry.getRegisteredPlugins().map((p) => p.id), 'its plugin stayed in the list').toEqual(['neighbour']);
    expect(registry.step('ghost-step'), 'its step stayed registered').toBeUndefined();
    expect(registry.artifact('ghost-view'), 'its artifact stayed registered').toBeUndefined();
    expect(registry.unregisterPackFE('partial-pack'), 'it was recorded as registered').toEqual([]);
  });

  it("doesn't make its failure the next pack's", () => {
    const registry = createFePackRegistry();
    expect(() => registry.registerPackFE(registration({ steps: [unloadable('theirs')] }), 'broken-pack')).toThrow();

    expect(() => registry.registerPackFE(
      registration({ plugins: [plugin('mine')], steps: [{ type: 'mine', kind: 'step' } as StepDefinition] }),
      'later-pack',
    )).not.toThrow();
    expect(registry.getRegisteredPlugins().map((p) => p.id)).toEqual(['mine']);
  });

  it('gives back the default plugin it had taken', () => {
    const registry = createFePackRegistry();
    const first = plugin('first');

    expect(() => registry.registerPackFE(
      registration({ plugins: [first], defaultPlugin: first, steps: [unloadable('boom')] }),
      'default-pack',
    )).toThrow();

    expect(() => registry.getRegisteredDefaultPlugin(), 'it kept the default plugin slot').toThrow();
  });
});

// The backend registry refuses a pack id it already holds; this one used to overwrite what it had recorded,
// so the first registration's way back out was dropped and its plugins could never be removed.
describe('a pack registering its frontend twice', () => {
  it('is refused, as the backend registry refuses it', () => {
    const registry = createFePackRegistry();
    registry.registerPackFE(registration({ plugins: [plugin('once')] }), 'twice-pack');

    expect(() => registry.registerPackFE(registration({ plugins: [plugin('again')] }), 'twice-pack'))
      .toThrow('Pack "twice-pack" frontend is already registered');

    expect(registry.unregisterPackFE('twice-pack').map((p) => p.id)).toEqual(['once']);
    expect(registry.getRegisteredPlugins()).toEqual([]);
  });
});
