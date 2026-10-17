import type { ComputedRef } from 'vue';
import type { BlockCatalogEntry } from '../framework/catalog-view.ts';
import { selectCatalogDeclaration, selectCatalogDeclarations } from '../framework/catalog-selection.ts';
import { boundFeHost } from '../runtime/fe-host.ts';
import { matchesFrontendDeclaration, useFrontendDeclarations } from './catalog-bindings.ts';
import type { BlockFrontendBinding } from './viewer-bindings.ts';

/** Selected metadata, available without loading a provider; ambiguous owners are omitted. */
export function getBlockDeclarations(): readonly BlockCatalogEntry[] {
  return selectCatalogDeclarations(boundFeHost().catalog.blocks());
}

export function getBlockDeclaration(type: string): BlockCatalogEntry | undefined {
  return selectCatalogDeclaration(type, boundFeHost().catalog.blocks());
}

/** Only bindings admitted for the current enabled declaration may render new work. */
export function getBlockBinding(type: string): BlockFrontendBinding | undefined {
  const host = boundFeHost();
  if (host.catalog.status() !== 'ready') return undefined;
  const accepted = host.packs.blockBindings().get(type);
  return matchesFrontendDeclaration(getBlockDeclaration(type), accepted) ? accepted : undefined;
}

/** Scoped updates include both declaration changes and executable readiness. */
export function useBlockDeclarations(): ComputedRef<readonly BlockCatalogEntry[]> {
  return useFrontendDeclarations('useBlockDeclarations', getBlockDeclarations);
}
