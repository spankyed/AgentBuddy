// The renderer resolves each role to the plugin that plays it; a role another plugin plays stays with it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from '@abuddy/sdk/fe';
import { getDesignated, hasDesignation } from '@abuddy/sdk/designations';
import { bindFeHost } from '@abuddy/sdk/runtime';
import { createFePackRegistry } from '../../src/fe/pack-store.ts';

const { registerPackFE, unregisterPackFE, ...registry } = createFePackRegistry();
bindFeHost({ application: {} as never, secrets: {} as never, transport: {} as never, packs: registry });

const plugin = (id: string, designation: string) => ({ id, designation }) as unknown as Plugin;

const packs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const id of packs.splice(0)) unregisterPackFE(id);
});

function register(packId: string, ...plugins: Plugin[]): void {
  registerPackFE({ plugins }, packId);
  packs.push(packId);
}

describe('frontend designations', () => {
  it('resolve a role to the plugin that plays it, and drop it when the pack unregisters', () => {
    register('notebook-pack', plugin('notebook-main', 'notebook'));
    expect(getDesignated('notebook')).toBe('notebook-main');

    unregisterPackFE(packs.pop()!);
    expect(hasDesignation('notebook')).toBe(false);
  });

  it('keep a role with the plugin that played it first', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    register('first-pack', plugin('first-notebook', 'notebook'));
    register('second-pack', plugin('second-notebook', 'notebook'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Designation "notebook" of plugin "second-notebook" from pack second-pack ignored'));

    unregisterPackFE(packs.pop()!);
    expect(getDesignated('notebook')).toBe('first-notebook');
  });
});
