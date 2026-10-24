import { hasOwn } from '../utils/shared.ts';

/** Declarative entity ownership/shapes and the pack-level relation wire vocabulary. */
export interface PackDataDeclarations {
  data?: { entities?: Readonly<Record<string, string | null>>; relations?: readonly string[]; roles?: readonly string[] };
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

/** A relation kind's or a role's stored name: snake_case, its generated EARS constant the same in uppercase */
export const _WIRE_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/** The flat EARS constants of a list of wire names, refusing an invalid or repeated one */
function wireConstants(wires: readonly string[], what: 'Relation' | 'Role', key: 'relations' | 'roles'): Record<string, string> {
  const constants: Record<string, string> = {};
  for (const wire of wires) {
    if (!_WIRE_NAME_PATTERN.test(wire)) throw new Error(`${what} "${wire}" must be a snake_case wire name`);
    const name = wire.toUpperCase();
    if (hasOwn(constants, name)) throw new Error(`${what} "${wire}" is declared twice in data.${key}`);
    constants[name] = wire;
  }
  return constants;
}

/** @internal The pack's relation kinds as EARS constants (`tagged_with` → `TAGGED_WITH`) */
export function _packRelationTypes(declaration: PackDataDeclarations): Record<string, string> {
  return wireConstants(declaration.data?.relations ?? [], 'Relation', 'relations');
}

/** @internal The pack's roles as EARS constants (`entry_event` → `ENTRY_EVENT`) */
export function _packRoles(declaration: PackDataDeclarations): Record<string, string> {
  return wireConstants(declaration.data?.roles ?? [], 'Role', 'roles');
}
