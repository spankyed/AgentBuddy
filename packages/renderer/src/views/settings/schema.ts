import type * as Monaco from 'monaco-editor';
import type { SettingsCatalog, SettingsDefinition } from '@apackdev/sdk/framework';
import { FEATURE_ID_PATTERN, PACK_ID_PATTERN } from '@apackdev/sdk/ids';

type JsonDefaults = typeof Monaco.json.jsonDefaults;
type SchemaResource = NonNullable<JsonDefaults['diagnosticsOptions']['schemas']>[number];

/** Separate resources preserve each owner's local $refs and prevent identical $ids colliding. */
export function settingsEditorSchemas(catalog: SettingsCatalog, modelUri: string): SchemaResource[] {
  const base = `apack-settings://schema/${encodeURIComponent(modelUri)}/${catalog.revision}/`;
  const resources: SchemaResource[] = [];
  const owner = (key: string, definition: SettingsDefinition) => {
    const uri = base + encodeURIComponent(key);
    resources.push({ uri, schema: {
      ...structuredClone(definition.schema), $id: uri,
      ...(definition.title ? { title: definition.title } : {}),
      ...(definition.description ? { description: definition.description } : {}),
      default: structuredClone(definition.defaults),
    } });
    return { $ref: uri };
  };
  const object = (properties: Record<string, unknown>, propertyNames?: unknown) => ({
    type: 'object', properties, required: Object.keys(properties),
    ...(propertyNames ? { propertyNames } : {}),
  });
  const packs = Object.fromEntries(Object.entries(catalog.packs).map(([packId, groups]) => [packId,
    object(Object.fromEntries(Object.entries(groups).map(([groupId, definition]) =>
      [groupId, owner(`packs/${packId}/${groupId}`, definition)])), { pattern: FEATURE_ID_PATTERN.source }),
  ]));
  const features = Object.fromEntries(Object.entries(catalog.features).map(([ref, definition]) =>
    [ref, owner(`features/${ref}`, definition)]));
  resources.push({ uri: base + 'document', fileMatch: [modelUri], schema: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    ...object({
      app: owner('app', catalog.app),
      packs: { ...object(packs, { pattern: PACK_ID_PATTERN.source }),
        required: Object.keys(catalog.packs).filter(packId => Object.keys(catalog.packs[packId]).length > 0), additionalProperties: {
        type: 'object', propertyNames: { pattern: FEATURE_ID_PATTERN.source },
      } },
      features: object(features, { pattern: `${PACK_ID_PATTERN.source.slice(0, -1)}/${FEATURE_ID_PATTERN.source.slice(1)}` }),
    }),
    additionalProperties: false,
  } });
  return resources;
}

/** Register only this model's schemas; disposal retains registrations made by other editors. */
export function registerSettingsEditorSchemas(defaults: JsonDefaults, catalog: SettingsCatalog, modelUri: string): () => void {
  const resources = settingsEditorSchemas(catalog, modelUri);
  const owned = new Set(resources.map(resource => resource.uri));
  const removeOwned = () => (defaults.diagnosticsOptions.schemas ?? []).filter(resource => !owned.has(resource.uri));
  defaults.setDiagnosticsOptions({ ...defaults.diagnosticsOptions, schemas: [...removeOwned(), ...resources] });
  return () => defaults.setDiagnosticsOptions({ ...defaults.diagnosticsOptions, schemas: removeOwned() });
}
