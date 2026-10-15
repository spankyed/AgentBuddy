import { createNativeFrontendTestRegistry } from '@apackdev/host/fe/testing';
import { expect, it, vi } from 'vitest';

const feature = { kind: 'feature', featureRef: 'owner/shared' } as const;
const group = { kind: 'pack', packId: 'owner', groupId: 'shared' } as const;
const featureForm = { name: 'FeatureForm' };
const groupForm = { name: 'GroupForm' };

it('registers feature and group forms independently of plugins and keeps identical local names distinct', () => {
  const packs = createNativeFrontendTestRegistry();
  packs.registerFixture({ id: 'owner', features: { shared: { settingsForm: featureForm } }, settingsForms: { shared: groupForm } });
  expect(packs.getRegisteredPlugins()).toEqual([]);
  expect(packs.settingsForm(feature)).toBe(featureForm);
  expect(packs.settingsForm(group)).toBe(groupForm);
  packs.registerFixture({ id: 'other', settingsForms: { shared: { name: 'OtherForm' } } });
  packs.unregisterPackFE('owner');
  expect(packs.settingsForm(feature)).toBeUndefined();
  expect(packs.settingsForm(group)).toBeUndefined();
  expect(packs.settingsForm({ ...group, packId: 'other' })).toEqual({ name: 'OtherForm' });
});

it('publishes accepted forms atomically and never publishes a refused registration', () => {
  const packs = createNativeFrontendTestRegistry();
  const read = vi.fn(() => packs.settingsForm(group));
  const stop = packs.onChanged(read);
  expect(() => packs.registerFixture({ id: 'owner', settingsForms: { shared: groupForm }, bindSettings: () => { throw new Error('refused'); } })).toThrow('requires host-bound');
  expect(read).not.toHaveBeenCalled();
  expect(packs.settingsForm(group)).toBeUndefined();
  packs.registerFixture({ id: 'owner', settingsForms: { shared: groupForm } });
  expect(read.mock.results[0].value).toBe(groupForm);
  packs.unregisterPackFE('owner');
  expect(read.mock.results[1].value).toBeUndefined();
  stop();
  packs.registerFixture({ id: 'owner', settingsForms: { shared: groupForm } });
  expect(read).toHaveBeenCalledTimes(2);
});

it('refuses group IDs that could claim another owner', () => {
  const packs = createNativeFrontendTestRegistry();
  expect(() => packs.registerFixture({ id: 'owner', settingsForms: { 'other/shared': groupForm } })).toThrow();
  expect(packs.settingsForm({ ...group, packId: 'other' })).toBeUndefined();
});

it('isolates subscriber failure from acceptance and other readers', () => {
  const packs = createNativeFrontendTestRegistry();
  packs.onChanged(() => { throw new Error('broken view'); });
  const read = vi.fn();
  packs.onChanged(read);
  expect(() => packs.registerFixture({ id: 'owner', settingsForms: { shared: groupForm } })).not.toThrow();
  expect(read).toHaveBeenCalledOnce();
  expect(packs.settingsForm(group)).toBe(groupForm);
});
