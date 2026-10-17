import type { ComputedRef } from 'vue';
import type { ArtifactCatalogEntry } from '../framework/catalog-view.ts';
import { selectCatalogDeclaration, selectCatalogDeclarations } from '../framework/catalog-selection.ts';
import { boundFeHost } from '../runtime/fe-host.ts';
import { matchesFrontendDeclaration, useFrontendDeclarations } from './catalog-bindings.ts';
import type { ArtifactFrontendBinding } from './viewer-bindings.ts';

/** Selected metadata, available without loading a provider; ambiguous owners are omitted. */
export function getArtifactDeclarations(): readonly ArtifactCatalogEntry[] {
  return selectCatalogDeclarations(boundFeHost().catalog.artifacts());
}

export function getArtifactDeclaration(type: string): ArtifactCatalogEntry | undefined {
  return selectCatalogDeclaration(type, boundFeHost().catalog.artifacts());
}

/** Only bindings admitted for the current enabled declaration may render new work. */
export function getArtifactBinding(type: string): ArtifactFrontendBinding | undefined {
  const host = boundFeHost();
  if (host.catalog.status() !== 'ready') return undefined;
  const accepted = host.packs.artifactBindings().get(type);
  return matchesFrontendDeclaration(getArtifactDeclaration(type), accepted) ? accepted : undefined;
}

/** Scoped updates include both declaration changes and executable readiness. */
export function useArtifactDeclarations(): ComputedRef<readonly ArtifactCatalogEntry[]> {
  return useFrontendDeclarations('useArtifactDeclarations', getArtifactDeclarations);
}
