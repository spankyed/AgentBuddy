// The renderer resolves each role to the plugin that plays it; a pack claiming a role another plays is refused, as
// the backend registry refuses it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginDefinition } from '@abuddy/sdk/fe';
import { getDesignated, hasDesignation } from '@abuddy/sdk/designations';
import { bindFeHost } from '@abuddy/sdk/runtime';
import { createFePackRegistry } from '../../src/fe/pack-store.ts';

const { registerPackFE, unregisterPackFE, ...registry } = createFePackRegistry();
bindFeHost({ application: {} as never, secrets: {} as never, settings: {} as never, client: {} as never, packs: registry });

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
  // The backend resolves a role its feature plays with no plugin; the frontend has to agree
  it('resolve a role played by a feature with no plugin to its ref, adding no plugin', () => {
    registerPackFE({ id: 'clock-pack', features: { scheduler: { designation: 'clock' } } });
    packs.push('clock-pack');

    expect(getDesignated('clock')).toBe('clock-pack/scheduler');
    expect(registry.getRegisteredPlugins().map((p) => p.id)).not.toContain('clock-pack/scheduler');
  });

  it('refuse a pack claiming a role another plays, leaving nothing of it registered', () => {
    register('first-pack', [['firstNotebook', 'notebook']]);
    expect(() => register('second-pack', [['secondNotebook', 'notebook']])).toThrow('Designation collision: role "notebook" — pack "second-pack" vs "first-pack"');

    expect(getDesignated('notebook')).toBe('first-pack/firstNotebook');
    expect(registry.getRegisteredPlugins().map((p) => p.id)).toEqual(['first-pack/firstNotebook']);
  });
});
