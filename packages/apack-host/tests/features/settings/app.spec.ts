import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { untypedQx, untypedTx } from '@apackdev/ears';
import type { EARS } from '@apackdev/sdk';
import { resetTestData } from '@apackdev/sdk/testing';
import { generateSettingsTypes } from '@apackdev/sdk/build';
import { registry } from '../../packs/runtime/test-host.ts';
import { appSettingsDefinition } from '../../../src/features/settings/be/app-definition.ts';
import { createSettingsStore } from '../../../src/features/settings/be/store.ts';
import { migration } from '../../../src/migrations/app/0.4.0.ts';
import { moveAppSettings } from '../../../src/migrations/app/app-settings.ts';

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

it('allows editing valid fields around unchanged invalid restored values', () => {
  untypedTx(id, true).put('entityType', 'Settings').put('data', { app: { projects: 'old-invalid' } });
  const settings = store();
  settings.setSectionValue('app', ['personal', 'name'], 'Ada');
  expect(settings.getStored()).toEqual({ app: { personal: { name: 'Ada' }, projects: 'old-invalid' } });
  expect(() => settings.setSectionValue('app', ['projects'], 1)).toThrow('App');
});

it('does not accept pack defaults for app preferences', () => {
  expect(() => registry.registerPack({ id: 'app-claim', settingsSections: () => ({ app: {} }) })).toThrow('App preferences belong to the host');
});

describe('0.4.0 app ownership migration', () => {
  it('preserves destination choices, orphan owners and project/directory order, idempotently', () => {
    const projects = [{ name: 'Two', directories: ['/second', '/first'], color: 'blue' }, { name: 'One', directories: [], color: 'red' }];
    const data = {
      general: { personal: { name: 'Old', phoneNumber: '123' }, projects: { projects }, application: { hotkeys: { switchPluginUp: { key: 'k' } }, openLinksInApp: false }, orphan: { x: 1 } },
      app: { personal: { name: 'New' }, hotkeys: { switchPluginUp: { key: 'n' } } },
      features: { 'uninstalled/feature': { orphan: true } }, packs: { uninstalled: { group: { x: 2 } } }, assistant: { birthdate: 'then' },
    };
    const next = moveAppSettings(data);
    expect(next).toEqual({
      ...data, general: { application: { openLinksInApp: false }, orphan: { x: 1 } },
      app: { personal: { name: 'New', phoneNumber: '123' }, hotkeys: { switchPluginUp: { key: 'n' } }, projects },
    });
    expect(moveAppSettings(next)).toEqual(next);
    expect(data.general.projects).toEqual({ projects });
  });

  it('moves raw overrides through the real host migration before the writer validates', () => {
    untypedTx(id, true).put('entityType', 'Settings').put('data', {
      general: { personal: { name: 'Ada' }, projects: [], application: { hotkeys: appSettingsDefinition.defaults.hotkeys } },
      features: { 'orphan/notes': { x: 1 } },
    });
    migration(registry, () => []).up();
    const settings = store();
    expect(settings.getStored()).toEqual({ app: { personal: { name: 'Ada' } }, features: { 'orphan/notes': { x: 1 } } });
    settings.setSectionValue('app', ['personal', 'phoneNumber'], '123');
    const before = settings.getStored();
    migration(registry, () => []).up();
    expect(settings.getStored()).toEqual(before);
  });
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

it('resets a legacy orphan field without accepting new writes to the orphan section', () => {
  untypedTx(id, true).put('entityType', 'Settings').put('data', { general: { application: { openLinksInApp: false }, orphan: { x: 1 } } });
  const settings = store();
  settings.removeStored(['general', 'application', 'openLinksInApp']);
  expect(settings.getStored()).toEqual({ general: { application: {}, orphan: { x: 1 } } });
  expect(() => settings.setSectionValue('general', ['orphan', 'x'], 2)).toThrow('settings section');
});
