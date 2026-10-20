interface CatalogOwner { readonly type: string; readonly origin: 'native' | 'installed' | 'source' }

/** A unique runtime owner takes precedence over authoring-source previews. */
export function selectCatalogDeclaration<T extends CatalogOwner>(type: string, entries: readonly T[]): T | undefined {
  const owners = entries.filter(entry => entry.type === type);
  const runtime = owners.filter(entry => entry.origin !== 'source');
  const candidates = runtime.length ? runtime : owners;
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function selectCatalogDeclarations<T extends CatalogOwner>(entries: readonly T[]): readonly T[] {
  return Object.freeze([...new Set(entries.map(entry => entry.type))].flatMap(type => {
    const owner = selectCatalogDeclaration(type, entries);
    return owner ? [owner] : [];
  }));
}
