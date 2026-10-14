import type { PackCatalogSnapshot } from './catalog.ts';
import type { ReferenceCatalogEntry, DeclarationData, ReferenceDeclarations } from '@apackdev/sdk/framework';
import { resolveName } from '@apackdev/sdk/ids';

/** The same immutable reference projection for backend and window catalog readers. */
export function referenceCatalogEntries(snapshot: PackCatalogSnapshot): readonly ReferenceCatalogEntry[] {
  const collect = (packId: string, features: Record<string, { references?: DeclarationData<ReferenceDeclarations> }> | undefined,
    origin: ReferenceCatalogEntry['origin'], identity: Pick<ReferenceCatalogEntry, 'enabled' | 'declarationRevision' | 'artifactRevision'> = {}) =>
    Object.entries(features ?? {}).flatMap(([id, feature]) => feature.references
      ? [Object.freeze({ featureRef: resolveName(id, packId), packId, origin, declaration: feature.references, ...identity })] : []);
  return Object.freeze([
    ...snapshot.native.flatMap(pack => collect(pack.id, pack.features, 'native', { enabled: true })),
    ...snapshot.packs.flatMap(pack => collect(pack.snapshot.manifest.id, pack.snapshot.manifest.features, 'installed',
      { enabled: pack.enabled, declarationRevision: pack.snapshot.declarationRevision,
        ...(pack.artifactRevision !== undefined ? { artifactRevision: pack.artifactRevision } : {}) })),
    ...snapshot.sourcePacks.flatMap(pack => collect(pack.manifest.id, pack.manifest.features, 'source',
      { declarationRevision: pack.declarationRevision })),
  ]);
}
