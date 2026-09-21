// The renderer resolves each role to the plugin that plays it; a role another plugin plays stays with it.
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
    plugins: Object.fromEntries(roles.map(([featureId]) => [featureId, plugin(featureId)])),
    designations: Object.fromEntries(roles.map(([featureId, role]) => [role, featureId])),
  });
  packs.push(packId);
}

describe('frontend designations', () => {
  it('resolve a role to the plugin that plays it, and drop it when the pack unregisters', () => {
    register('notebook-pack', [['notebook-main', 'notebook']]);
    expect(getDesignated('notebook')).toBe('notebook-pack.notebook-main');

    unregisterPackFE(packs.pop()!);
    expect(hasDesignation('notebook')).toBe(false);
  });

  it('keep a role with the plugin that played it first', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    register('first-pack', [['first-notebook', 'notebook']]);
    register('second-pack', [['second-notebook', 'notebook']]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Designation "notebook" of plugin "second-pack.second-notebook" from pack second-pack ignored'));

    unregisterPackFE(packs.pop()!);
    expect(getDesignated('notebook')).toBe('first-pack.first-notebook');
  });
});
