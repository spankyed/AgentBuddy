import { resolveName } from '@apackdev/sdk/ids';
import type { PackCatalogSnapshot, PluginCatalogEntry } from './catalog.ts';
import type { DeclarationData, PluginDeclaration, NativePackDeclaration } from '@apackdev/sdk/framework';

const collect = (packId: string, features: Record<string, { plugin?: DeclarationData<PluginDeclaration> }> | undefined,
    origin: PluginCatalogEntry['origin'], identity: Pick<PluginCatalogEntry, 'enabled' | 'declarationRevision' | 'buildRevision'> = {}) =>
    Object.entries(features ?? {}).flatMap(([id, feature]) => feature.plugin
      ? [Object.freeze({ featureRef: resolveName(id, packId), packId, origin, declaration: feature.plugin, ...identity })] : []);

/** Local native declarations exist before any backend connection. */
export function nativePluginCatalogEntries(declarations: readonly DeclarationData<NativePackDeclaration>[]): readonly PluginCatalogEntry[] {
  return Object.freeze(declarations.flatMap(pack => collect(pack.id, pack.features, 'native', { enabled: true })));
}

/** Plugin metadata is independent of frontend delivery and actor readiness. */
export function pluginCatalogEntries(snapshot: PackCatalogSnapshot): readonly PluginCatalogEntry[] {
  return Object.freeze([
    ...nativePluginCatalogEntries(snapshot.native),
    ...snapshot.packs.flatMap(pack => collect(pack.snapshot.manifest.id, pack.snapshot.manifest.features, 'installed',
      { enabled: pack.enabled, declarationRevision: pack.snapshot.declarationRevision,
        ...(pack.buildRevision !== undefined && { buildRevision: pack.buildRevision }) })),
    ...snapshot.sourcePacks.flatMap(pack => collect(pack.manifest.id, pack.manifest.features, 'source',
      { declarationRevision: pack.declarationRevision })),
  ]);
}
