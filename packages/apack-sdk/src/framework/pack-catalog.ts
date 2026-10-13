import { boundHost } from '../runtime/host-runtime.ts';

/** Observe committed declaration changes, independently of executable pack activation. */
export function onPackCatalogChanged(listener: () => void): () => void {
  return boundHost().packs.onCatalogChanged(listener);
}
