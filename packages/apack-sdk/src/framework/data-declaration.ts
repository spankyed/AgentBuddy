import { hasOwn } from '../utils/shared.ts';

/** Declarative entity ownership/shapes and the pack-level relation wire vocabulary. */
export interface PackDataDeclarations {
  data?: { entities?: Readonly<Record<string, string | null>>; relations?: readonly string[] };
  features?: Readonly<Record<string, object>>;
}

/** @internal A normalized entity declaration; paths are relative to the pack root. */
export interface _PackEntityDeclaration {
  name: string;
  owner: string;
  shape: string | null;
}

/** @internal Read declarations without loading shape modules; refuse ambiguous ownership. */
export function _packEntities(declaration: PackDataDeclarations): _PackEntityDeclaration[] {
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
export function _packEntityTypes(declaration: PackDataDeclarations): Record<string, string> {
  return Object.fromEntries(_packEntities(declaration).map(({ name }) => [name, name]));
}

export const _RELATION_WIRE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/** @internal Derive the flat EARS constants once; refuse invalid or repeated wire identities. */
export function _packRelationTypes(declaration: PackDataDeclarations): Record<string, string> {
  const types: Record<string, string> = {};
  for (const wire of declaration.data?.relations ?? []) {
    if (!_RELATION_WIRE_PATTERN.test(wire)) throw new Error(`Relation "${wire}" must be a snake_case wire name`);
    const name = wire.toUpperCase();
    if (hasOwn(types, name)) throw new Error(`Relation "${wire}" is declared twice in data.relations`);
    types[name] = wire;
  }
  return types;
}
