import { hasOwn } from '../utils/shared.ts';
import type { RowRules } from '@apackdev/ears';

/** Declarative entity ownership/shapes and the pack-level relation wire vocabulary. */
export interface PackDataDeclarations {
  data?: {
    entities?: Readonly<Record<string, string | null>>;
    shortCodes?: Readonly<Record<string, string>>;
    relations?: readonly string[];
    roles?: readonly string[];
  };
  features?: Readonly<Record<string, object>>;
}

/** @internal A normalized entity declaration; paths are relative to the pack root. */
export interface _PackEntityDeclaration {
  name: string;
  owner: string;
  shape: string | null;
  /** The prefix its short codes are numbered with, when the block declaring it names one (`shortCodes`) */
  shortCode?: string;
}

/**
 * @internal A short code prefix: three uppercase letters — the word's common abbreviation where it has one (`DOC`, `MSG`), and
 * otherwise its first letter and next two distinct consonants (`THR`, `FLW`). The pattern is the rule; the choice
 * of letters is the convention
 */
export const _SHORT_CODE_PATTERN = /^[A-Z]{3}$/;

type DeclarationBlock = { entities?: Readonly<Record<string, string | null>>; shortCodes?: Readonly<Record<string, string>> } | null | undefined;

/** @internal Read declarations without loading shape modules; refuse ambiguous ownership. */
export function _packEntities(declaration: PackDataDeclarations): _PackEntityDeclaration[] {
  const result = new Map<string, _PackEntityDeclaration>();
  const homes: Array<[string, DeclarationBlock]> = [
    ['data', declaration.data],
    ...Object.entries(declaration.features ?? {}).map(([id, feature]): [string, DeclarationBlock] => [`features.${id}`, feature as DeclarationBlock]),
  ];
  const prefixOwners = new Map<string, string>();
  for (const [owner, block] of homes) {
    const entities = block?.entities ?? {};
    const shortCodes = block?.shortCodes ?? {};
    // A prefix sits beside the entity it numbers, in the block that declares it
    for (const [name, prefix] of Object.entries(shortCodes)) {
      if (!hasOwn(entities, name)) throw new Error(`"${owner}.shortCodes" names "${name}", which "${owner}" declares no entity of`);
      if (!_SHORT_CODE_PATTERN.test(prefix)) throw new Error(`The short code prefix of "${name}" is "${prefix}": a prefix is three uppercase letters`);
      const taken = prefixOwners.get(prefix);
      if (taken) throw new Error(`The short code prefix "${prefix}" is declared for both "${taken}" and "${name}"`);
      prefixOwners.set(prefix, name);
    }
    for (const [name, shape] of Object.entries(entities)) {
      const previous = result.get(name);
      if (previous) throw new Error(`Entity "${name}" is declared by both "${previous.owner}" and "${owner}"`);
      const shortCode = hasOwn(shortCodes, name) ? shortCodes[name] : undefined;
      result.set(name, { name, owner, shape, ...(shortCode !== undefined && { shortCode }) });
    }
  }
  return [...result.values()];
}

/** @internal Flat wire identities for EARS and compiled type inventories. */
export function _packEntityTypes(declaration: PackDataDeclarations): Record<string, string> {
  return Object.fromEntries(_packEntities(declaration).map(({ name }) => [name, name]));
}

/** @internal Each of the pack's numbered entity types and the prefix its manifest declares */
export function _packShortCodes(declaration: PackDataDeclarations): Record<string, string> {
  return Object.fromEntries(_packEntities(declaration).flatMap(({ name, shortCode }) => (shortCode === undefined ? [] : [[name, shortCode]])));
}

/**
 * @internal A lookup from a short code to the entity type that numbers it, built from the row rules holding each
 * type's prefix (`RowRules.shortCode`): `THR-41` → `Thread`. Undefined for a code that isn't `<prefix>-<n>`, or whose
 * prefix no type declares. A prefix belongs to one type across the app, which the registry and the manifest schema
 * enforce, so the answer is never ambiguous; the app's registry, a data dir's schema and the test runtime build theirs
 * with this, so all three answer alike.
 */
export function _shortCodeTypes(rules: Iterable<readonly [string, Partial<RowRules>]>): (code: string) => string | undefined {
  const byPrefix = new Map<string, string>();
  for (const [type, { shortCode }] of rules) if (shortCode) byPrefix.set(shortCode, type);
  return (code) => {
    if (typeof code !== 'string') return undefined;
    const dash = code.lastIndexOf('-');
    if (dash <= 0 || !/^[1-9][0-9]*$/.test(code.slice(dash + 1))) return undefined;
    return byPrefix.get(code.slice(0, dash));
  };
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
