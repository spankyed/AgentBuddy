import { SDK_ENTITIES } from '@apackdev/sdk/types';
import { _entityDestinationsProblem, _packEntityTypes } from '@apackdev/sdk/framework';
import { resolveName } from '@apackdev/sdk/ids';
import type { PackCatalogSnapshot, PluginCatalogEntry } from './catalog.ts';
import type { DeclarationData, PluginDeclaration, NativePackDeclaration } from '@apackdev/sdk/framework';

const collect = (packId: string, features: Record<string, { plugin?: DeclarationData<PluginDeclaration> }> | undefined,
    origin: PluginCatalogEntry['origin'], identity: Pick<PluginCatalogEntry, 'enabled' | 'declarationRevision' | 'buildRevision'> = {},
    destinations?: Readonly<Record<string, string>>) =>
    Object.entries(features ?? {}).flatMap(([id, feature]) => feature.plugin
      ? [Object.freeze({ featureRef: resolveName(id, packId), packId, origin, declaration: feature.plugin, ...identity,
        ...(destinations !== undefined && { opens: Object.freeze(Object.keys(destinations).filter(entity => destinations[entity] === id).sort()) }) })] : []);

/** Local native declarations exist before any backend connection. */
export function nativePluginCatalogEntries(declarations: readonly DeclarationData<NativePackDeclaration>[]): readonly PluginCatalogEntry[] {
  const entries = declarations.flatMap(pack => collect(pack.id, pack.features, 'native', { enabled: true }, pack.entityDestinations ?? {}));
  assertPluginDestinationClaims(entries);
  return Object.freeze(entries);
}

/** Plugin metadata is independent of frontend delivery and actor readiness. */
export function pluginCatalogEntries(snapshot: PackCatalogSnapshot): readonly PluginCatalogEntry[] {
  return Object.freeze([
    ...nativePluginCatalogEntries(snapshot.native),
    ...snapshot.packs.flatMap(pack => collect(pack.snapshot.manifest.id, pack.snapshot.manifest.features, 'installed',
      { enabled: pack.enabled, declarationRevision: pack.snapshot.declarationRevision,
        ...(pack.buildRevision !== undefined && { buildRevision: pack.buildRevision }) }, pack.snapshot.entityDestinations)),
    ...snapshot.sourcePacks.flatMap(pack => collect(pack.manifest.id, pack.manifest.features, 'source',
      { declarationRevision: pack.declarationRevision })),
  ]);
}


/** Refuse the whole candidate before publication; disabled claims remain discoverable. */
export function assertEntityDestinationClaims(snapshot: PackCatalogSnapshot): void {
  const entities = new Set([...Object.values(SDK_ENTITIES),
    ...snapshot.packs.flatMap(pack => Object.keys(pack.snapshot.types.entities)),
    ...snapshot.native.flatMap(pack => Object.keys(_packEntityTypes(pack)))]);
  for (const { snapshot: pack } of snapshot.packs) {
    const problem = _entityDestinationsProblem(pack.entityDestinations, pack.manifest.features,
      new Set([...Object.values(SDK_ENTITIES), ...Object.keys(pack.types.entities)]));
    if (problem) throw new Error(`Pack "${pack.manifest.id}": ${problem}`);
  }
  for (const pack of snapshot.native) {
    const problem = _entityDestinationsProblem(pack.entityDestinations ?? {}, pack.features, entities);
    if (problem) throw new Error(`Pack "${pack.id}": ${problem}`);
  }
  assertPluginDestinationClaims(pluginCatalogEntries(snapshot));
}

function assertPluginDestinationClaims(entries: readonly PluginCatalogEntry[]): void {
  const owners = new Map<string, string>();
  for (const plugin of entries) {
    if (plugin.origin === 'source' || plugin.enabled !== true) continue;
    for (const entity of plugin.opens ?? []) {
      const previous = owners.get(entity);
      if (previous !== undefined) throw new Error(`Entity destination "${entity}" claimed by both "${previous}" and "${plugin.featureRef}"`);
      owners.set(entity, plugin.featureRef);
    }
  }
}
