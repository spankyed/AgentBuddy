import { expect, it, vi } from 'vitest';
import { createMachine } from 'xstate';
import { getEligiblePlugin, selectEntityDestination } from '../../src/fe/plugin-selection.ts';
import { createFePackRegistry } from '../../src/fe/pack-store.ts';
import { createContributionCatalog } from '../../src/packs/catalog.ts';
import { appSettingsDefinition } from '../../src/features/settings/be/app-definition.ts';
import type { PluginCatalogEntry } from '../../src/packs/catalog.ts';

it('distinguishes loading, disconnected, unclaimed, disabled, declared and ambiguous destinations', () => {
  let status: 'ready' | 'loading' | 'disconnected' = 'ready';
  const declaration: PluginCatalogEntry = { packId: 'native', featureRef: 'native/view' as PluginCatalogEntry['featureRef'],
    origin: 'native', enabled: false, declaration: { label: 'View', state: 'never.ts' }, opens: ['Action'] };
  const entries = [declaration];
  const catalog = { status: () => status, plugins: () => entries, subscribe: vi.fn(() => () => {}) };
  expect(selectEntityDestination(catalog, 'Prompt')).toEqual({ status: 'unclaimed' });
  expect(selectEntityDestination(catalog, 'Action')).toMatchObject({ status: 'disabled' });
  entries[0] = { ...declaration, enabled: true };
  expect(selectEntityDestination(catalog, 'Action')).toEqual({ status: 'declared', destination: entries[0] });
  status = 'loading'; expect(selectEntityDestination(catalog, 'Action')).toEqual({ status: 'loading' });
  status = 'disconnected'; expect(selectEntityDestination(catalog, 'Action')).toEqual({ status: 'unavailable' });
  status = 'ready'; entries.push({ ...entries[0], packId: 'second', featureRef: 'second/view' as PluginCatalogEntry['featureRef'] });
  expect(selectEntityDestination(catalog, 'Action')).toMatchObject({ status: 'ambiguous', destinations: entries });
  entries.splice(0, entries.length, { ...declaration, enabled: true, origin: 'source' });
  expect(selectEntityDestination(catalog, 'Action')).toEqual({ status: 'unclaimed' });
});

it('ties native destination claims to the accepted frontend even when its machine is reused', () => {
  const declaration = { id: 'native', entityDestinations: { Action: 'view' }, features: {
    view: { description: 'Open entities', plugin: { label: 'View', state: 'never.ts' } },
  } };
  const contributions = createContributionCatalog(appSettingsDefinition);
  contributions.setNative([declaration]);
  const catalog = { status: () => 'ready' as const, plugins: contributions.plugins, subscribe: contributions.onChanged };
  const registry = createFePackRegistry();
  const registration = { id: 'native', features: { view: { plugin: { label: 'View', state: createMachine({}) } } } };
  registry.registerPackFE({ kind: 'native', declaration }, registration);
  expect(getEligiblePlugin(catalog, registry.pluginBindings(), 'native/view')).toBeDefined();
  contributions.setNative([{ ...declaration, entityDestinations: { Prompt: 'view' } }]);
  expect(getEligiblePlugin(catalog, registry.pluginBindings(), 'native/view')).toBeUndefined();
  expect(selectEntityDestination(catalog, 'Action')).toEqual({ status: 'unclaimed' });
  expect(selectEntityDestination(catalog, 'Prompt')).toMatchObject({ status: 'declared' });
  registry.replacePackFE({ kind: 'native', declaration: { ...declaration, entityDestinations: { Prompt: 'view' } } }, registration);
  expect(getEligiblePlugin(catalog, registry.pluginBindings(), 'native/view')).toBeDefined();
});
