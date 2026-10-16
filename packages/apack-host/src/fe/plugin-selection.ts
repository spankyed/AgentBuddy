import { isEqual } from '../features/settings/document.ts';
import type { PluginCatalogEntry } from '../packs/catalog.ts';
import type { PluginFrontendBinding } from './pack-store.ts';

export interface ShellPluginCatalog {
  status(): 'loading' | 'ready' | 'disconnected' | 'error' | 'disposed';
  plugins(): readonly PluginCatalogEntry[];
  subscribe(listener: () => void): () => void;
}

/** Installed/native ownership takes precedence over authoring-source previews. */
export function selectPluginDeclaration(catalog: ShellPluginCatalog, ref: string): PluginCatalogEntry | undefined {
  const owners = catalog.plugins().filter(entry => entry.featureRef === ref);
  const runtime = owners.filter(entry => entry.origin !== 'source');
  const candidates = runtime.length ? runtime : owners;
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** The default is selected before frontend loading; delivery order cannot change its owner. */
export function selectDefaultPluginDeclaration(catalog: ShellPluginCatalog): PluginCatalogEntry | undefined {
  return catalog.plugins().filter(entry => entry.enabled === true && entry.origin !== 'source' && entry.declaration.default
    && selectPluginDeclaration(catalog, entry.featureRef)?.packId === entry.packId)
    .sort((a, b) => (a.origin === 'native' ? 0 : 1) - (b.origin === 'native' ? 0 : 1)
      || a.featureRef.localeCompare(b.featureRef, 'en'))[0];
}

/** A declaration does not authorize stale components or actors to receive new work. */
export function getEligiblePlugin(catalog: ShellPluginCatalog, bindings: ReadonlyMap<string, PluginFrontendBinding>, ref: string) {
  const owner = selectPluginDeclaration(catalog, ref); const accepted = bindings.get(ref);
  if (!owner || owner.enabled !== true || owner.origin === 'source' || !accepted
    || (owner.origin !== 'native' && catalog.status() !== 'ready')
    || accepted.packId !== owner.packId || accepted.binding.id !== ref
    || !isEqual(owner.declaration, accepted.declaration)) return undefined;
  if (owner.origin === 'native') return accepted.declarationRevision === undefined && accepted.buildRevision === undefined
    && accepted.runtimeRevision === undefined ? accepted.binding : undefined;
  return owner.declarationRevision && owner.buildRevision && accepted.runtimeRevision
    && owner.declarationRevision === accepted.declarationRevision && owner.buildRevision === accepted.buildRevision
    ? accepted.binding : undefined;
}
