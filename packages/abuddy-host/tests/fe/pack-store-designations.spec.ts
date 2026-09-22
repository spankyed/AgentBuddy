// The renderer resolves each role to the plugin that plays it; a pack claiming a role another plays is refused, as
// the backend registry refuses it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginDefinition } from '@abuddy/sdk/fe';
import { getDesignated, hasDesignation } from '@abuddy/sdk/designations';
import { bindFeHost } from '@abuddy/sdk/runtime';
import { createFePackRegistry } from '../../src/fe/pack-store.ts';

const { registerPackFE, unregisterPackFE, ...registry } = createFePackRegistry();
bindFeHost({ application: {} as never, secrets: {} as never, transport: {} as never, packs: registry });

const plugin = (label: string) => ({ label }) as unknown as PluginDefinition;

const packs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const id of packs.splice(0)) unregisterPackFE(id);
});

/** A pack whose features each play a role: `register('p', [['main', 'notebook']])` */
function register(packId: string, roles: Array<[featureId: string, role: string]>): void {
  registerPackFE({
    id: packId,
    features: Object.fromEntries(roles.map(([featureId, designation]) => [featureId, { plugin: plugin(featureId), designation }])),
  });
  packs.push(packId);
}

describe('frontend designations', () => {
  it('resolve a role to the plugin that plays it, and drop it when the pack unregisters', () => {
    register('notebook-pack', [['notebookMain', 'notebook']]);
    expect(getDesignated('notebook')).toBe('notebook-pack/notebookMain');

    unregisterPackFE(packs.pop()!);
    expect(hasDesignation('notebook')).toBe(false);
  });

  it('refuse a pack claiming a role another plays, leaving nothing of it registered', () => {
    register('first-pack', [['firstNotebook', 'notebook']]);
    expect(() => register('second-pack', [['secondNotebook', 'notebook']])).toThrow('Designation collision: role "notebook" — pack "second-pack"');

    expect(getDesignated('notebook')).toBe('first-pack/firstNotebook');
    expect(registry.getRegisteredPlugins().map((p) => p.id)).toEqual(['first-pack/firstNotebook']);
  });
});
