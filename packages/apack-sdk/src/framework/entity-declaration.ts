/** Entity identity and optional TypeScript shape, declared once at its owning location. */
export interface PackEntityDeclarations {
  data?: { entities?: Readonly<Record<string, string | null>> };
  features?: Readonly<Record<string, object>>;
}

/** @internal A normalized entity declaration; paths are relative to the pack root. */
export interface _PackEntityDeclaration {
  name: string;
  owner: string;
  shape: string | null;
}

/** @internal Read declarations without loading shape modules; refuse ambiguous ownership. */
export function _packEntities(declaration: PackEntityDeclarations): _PackEntityDeclaration[] {
  const result = new Map<string, _PackEntityDeclaration>();
  const homes: Array<[string, Readonly<Record<string, string | null>> | undefined]> = [
    ['data', declaration.data?.entities],
    ...Object.entries(declaration.features ?? {}).map(([id, feature]): [string, Readonly<Record<string, string | null>> | undefined] => [`features.${id}`, (feature as { entities?: Readonly<Record<string, string | null>> } | null | undefined)?.entities]),
  ];
  for (const [owner, entities] of homes) {
    for (const [name, shape] of Object.entries(entities ?? {})) {
      const previous = result.get(name);
      if (previous) throw new Error(`Entity "${name}" is declared by both "${previous.owner}" and "${owner}"`);
      result.set(name, { name, owner, shape });
    }
  }
  return [...result.values()];
}

/** @internal Flat wire identities for EARS and compiled type inventories. */
export function _packEntityTypes(declaration: PackEntityDeclarations): Record<string, string> {
  return Object.fromEntries(_packEntities(declaration).map(({ name }) => [name, name]));
}
