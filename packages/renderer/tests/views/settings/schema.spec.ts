import { expect, it, vi } from 'vitest';
import type * as Monaco from 'monaco-editor';
import type { SettingsCatalog } from '@apackdev/sdk/framework';
import { registerSettingsEditorSchemas, settingsEditorSchemas } from '@/views/settings/schema';

const definition = {
  title: 'Display', description: 'Display preferences', defaults: { name: '' },
  schema: { $id: 'shared', type: 'object', properties: { name: { $ref: '#/definitions/Name' } },
    definitions: { Name: { type: 'string', description: 'Name shown in chat' } }, required: ['name'], additionalProperties: false },
};
const catalog: SettingsCatalog = {
  revision: 3, app: { schema: { type: 'object' }, defaults: {} },
  packs: { first: { assistant: definition }, second: { assistant: definition }, empty: {} },
  features: { 'first/code': definition }, dependencies: {},
};

it('isolates owner schemas and local references without changing accepted declarations', () => {
  const original = structuredClone(catalog);
  const resources = settingsEditorSchemas(catalog, 'inmemory://settings/one');
  const owners = resources.filter(resource => resource.uri.endsWith('assistant'));
  expect(owners).toHaveLength(2);
  expect(owners[0].uri).not.toBe(owners[1].uri);
  for (const resource of owners) {
    expect(resource.schema).toMatchObject({ $id: resource.uri, title: 'Display', description: 'Display preferences',
      properties: { name: { $ref: '#/definitions/Name' } }, definitions: definition.schema.definitions });
  }
  expect(resources.filter(resource => resource.fileMatch)).toMatchObject([{ fileMatch: ['inmemory://settings/one'],
    schema: { required: ['app', 'packs', 'features'], additionalProperties: false,
      properties: { packs: { required: ['first', 'second'] } } } }]);
  expect(catalog).toEqual(original);
});

it('retains other model registrations and options across refresh and disposal', () => {
  const unrelated = { uri: 'other-schema', fileMatch: ['inmemory://other'], schema: { type: 'string' } };
  let options: Monaco.json.DiagnosticsOptions = { validate: true, enableSchemaRequest: false, schemas: [unrelated] };
  const defaults = {
    get diagnosticsOptions() { return options; },
    setDiagnosticsOptions: vi.fn(value => { options = value; }),
  } as unknown as typeof Monaco.json.jsonDefaults;
  const stopFirst = registerSettingsEditorSchemas(defaults, catalog, 'inmemory://settings/one');
  const stopSecond = registerSettingsEditorSchemas(defaults, catalog, 'inmemory://settings/two');
  stopFirst();
  expect(options.schemas).toEqual([unrelated, ...settingsEditorSchemas(catalog, 'inmemory://settings/two')]);
  const stopRefresh = registerSettingsEditorSchemas(defaults, { ...catalog, revision: 4 }, 'inmemory://settings/one');
  stopSecond(); stopRefresh();
  expect(options).toEqual({ validate: true, enableSchemaRequest: false, schemas: [unrelated] });
});
