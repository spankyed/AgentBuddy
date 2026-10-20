import { expect, it, vi } from 'vitest';
import { resolveName } from '@apackdev/sdk/ids';
import { pluginNavigationItems } from '../../src/fe/plugin-navigation.ts';
import { neighbourOf } from '../../src/features/application/fe/plugins.ts';
import type { PluginCatalogEntry } from '../../src/packs/catalog.ts';
import type { PluginFrontendBinding } from '../../src/fe/pack-store.ts';
import { plugin } from '../features/application/fe/fakes.ts';

it('lists declared tabs in catalog order before loading, preserving defaults and overrides', () => {
  const entry = (packId: string, label: string, defaultVisible = true): PluginCatalogEntry => ({
    packId, featureRef: resolveName('view', packId), origin: 'installed', enabled: true,
    buildRevision: 'build', declarationRevision: 'declaration',
    declaration: { label, state: 'unavailable.ts#state', defaultVisible },
  });
  const entries = [entry('host', 'Settings'), entry('second', 'Second'), entry('first', 'First', false)];
  entries[0] = { ...entries[0], origin: 'native' };
  const catalog = { plugins: () => entries.map(owner => ({ ...owner })), status: () => 'ready' as const,
    subscribe: vi.fn(() => () => {}) };
  const bindings = new Map<string, PluginFrontendBinding>();
  const items = () => pluginNavigationItems(catalog, bindings, { 'first/view': true });
  expect(items().map(item => [item.id, item.label, item.visible])).toEqual([
    ['second/view', 'Second', true], ['first/view', 'First', true], ['host/view', 'Settings', true],
  ]);
  expect(pluginNavigationItems(catalog, bindings, {}).find(item => item.id === resolveName('view', 'first'))?.visible).toBe(false);
  // Runtime delivery order cannot reorder metadata, and a stale runtime cannot supply an icon.
  for (const owner of [...entries].reverse()) bindings.set(owner.featureRef, {
    packId: owner.packId, declaration: owner.declaration, binding: { ...plugin(owner.featureRef), icon: {} },
    declarationRevision: 'declaration', buildRevision: 'build', registrationId: 'runtime',
  });
  expect(items().map(item => item.id)).toEqual(['second/view', 'first/view', 'host/view']);
  expect(items()[0].icon).toBeDefined();
  bindings.set('second/view', { ...bindings.get('second/view')!, buildRevision: 'stale' });
  expect(items()[0].icon).toBeUndefined();
  expect(neighbourOf(items(), 'second/view', 'up')?.id).toBe('host/view');
  entries[1] = { ...entries[1], declaration: { ...entries[1].declaration, isPinned: true } };
  expect(items().map(item => item.id)).toEqual(['first/view', 'host/view', 'second/view']);
  expect(neighbourOf(items(), 'first/view', 'up')?.id).toBe('second/view');
  entries[1] = { ...entries[1], enabled: false };
  expect(items().map(item => item.id)).toEqual(['first/view', 'host/view']);
  entries.push({ ...entries[2], origin: 'source' });
  expect(items().map(item => item.id)).toEqual(['first/view', 'host/view']);
  entries.push(entries[2]);
  expect(items().map(item => item.id)).toEqual(['host/view']);
});
