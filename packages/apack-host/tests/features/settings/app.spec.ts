import { readFileSync } from 'node:fs';
import { beforeEach, expect, it } from 'vitest';
import { untypedQx, untypedTx } from '@apackdev/ears';
import type { EARS } from '@apackdev/sdk';
import { resetTestData } from '@apackdev/sdk/testing';
import { generateSettingsTypes } from '@apackdev/sdk/build';
import { registry } from '../../packs/runtime/test-host.ts';
import { appSettingsDefinition } from '../../../src/features/settings/be/app-definition.ts';
import { createSettingsStore } from '../../../src/features/settings/be/store.ts';

const id = 'Settings-app' as EARS.EntityId;
beforeEach(() => resetTestData());
const store = () => createSettingsStore({ defaults: () => ({ features: {} }) });

it('derives the public SDK types from the host definition', async () => {
  const generated = await generateSettingsTypes(appSettingsDefinition, 'AppSettings');
  const recorded = readFileSync(new URL('../../../../apack-sdk/src/types/app-settings.ts', import.meta.url), 'utf8');
  expect(recorded.slice(recorded.indexOf('\n') + 1)).toBe(generated);
});

it('provides and resets app preferences without default-setup and owns returned values', () => {
  const settings = store();
  expect(settings.getSection('app')).toEqual(appSettingsDefinition.defaults);
  expect(untypedQx(id).pickOne(['data'])).toBeNull();
  const first = settings.getSection<any>('app');
  first.hotkeys.switchPluginUp.modifiers.push('changed');
  expect(settings.getSection('app')).toEqual(appSettingsDefinition.defaults);
  settings.setSectionValue('app', ['personal', 'name'], 'Ada');
  expect(settings.getStored()).toEqual({ app: { personal: { name: 'Ada' } } });
  settings.removeStored(['app', 'personal', 'name']);
  expect(settings.getSection('app')).toEqual(appSettingsDefinition.defaults);
});

it.each([
  [['projects'], [{ name: 'Missing directories and color' }]],
  [['hotkeys', 'switchPluginUp', 'modifiers'], 1],
  [['personal', 'name'], undefined],
  [['unknown'], true],
])('refuses invalid app writes at %j without storing them', (path, value) => {
  const settings = store();
  expect(() => settings.setSectionValue('app', path as string[], value)).toThrow('App');
  expect(settings.getStored()).toEqual({});
});

it('refuses writes retaining invalid app values, including an unchanged replacement', () => {
  const data = { app: { projects: 'invalid' } };
  untypedTx(id, true).put('entityType', 'Settings').put('data', data);
  const settings = store();
  const heard: string[] = [];
  settings.onChange(change => heard.push(change));
  expect(() => settings.setSectionValue('app', ['personal', 'name'], 'Ada')).toThrow('App');
  expect(() => settings.replaceAll(settings.getAll())).toThrow('App');
  expect(settings.getStored()).toEqual(data);
  expect(heard).toEqual([]);
  settings.removeStored(['app', 'projects']);
  settings.setSectionValue('app', ['personal', 'name'], 'Ada');
  expect(settings.getStored()).toEqual({ app: { personal: { name: 'Ada' } } });
});

it('does not accept pack defaults for app preferences', () => {
  expect(() => registry.registerPack({ id: 'app-claim', settingsSections: () => ({ app: {} }) })).toThrow('App preferences belong to the host');
});

it('refuses newly missing required fields in feature arrays too', () => {
  registry.registerPack({ id: 'array-settings', features: { entries: { settings: {
    defaults: { items: [] }, schema: { type: 'object', properties: { items: { type: 'array', items: {
      type: 'object', properties: { name: { type: 'string' } }, required: ['name'],
    } } }, required: ['items'] },
  } } } });
  try {
    const settings = createSettingsStore({ defaults: () => ({ features: { 'array-settings/entries': { items: [] } } }) });
    expect(() => settings.setFeatureSetting('array-settings/entries' as never, ['items'], [{}])).toThrow('name');
    expect(settings.getStored()).toEqual({});
  } finally { registry.unregisterPack('array-settings'); }
});

it('refuses unknown root sections even when unchanged', () => {
  const data = { obsolete: { value: true } };
  untypedTx(id, true).put('entityType', 'Settings').put('data', data);
  const settings = store();
  expect(() => settings.setSectionValue('app', ['personal', 'name'], 'Ada')).toThrow('settings section');
  expect(settings.getStored()).toEqual(data);
  settings.removeStored(['obsolete']);
  expect(settings.getStored()).toEqual({});
});
