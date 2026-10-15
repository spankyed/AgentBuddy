import type { StepCatalogEntry } from './catalog-view.ts';

/** A unique runtime owner takes precedence over authoring-source previews. */
export function selectStepDeclaration(type: string, entries: readonly StepCatalogEntry[]): StepCatalogEntry | undefined {
  const owners = entries.filter(entry => entry.type === type);
  const runtime = owners.filter(entry => entry.origin !== 'source');
  const candidates = runtime.length ? runtime : owners;
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function selectStepDeclarations(entries: readonly StepCatalogEntry[]): readonly StepCatalogEntry[] {
  return Object.freeze([...new Set(entries.map(entry => entry.type))].flatMap(type => {
    const owner = selectStepDeclaration(type, entries);
    return owner ? [owner] : [];
  }));
}
