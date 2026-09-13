/*───────────────────────────────────────────────────────────────────────────
 * EARS type infrastructure
 *
 * The SDK provides the structural type framework — Entity, EntityId,
 * RelKind, AttrKind, Blueprint, BaseEntity, etc. — with open types
 * that the host composes with concrete values via registration.
 *
 * Entity and RelKind are open by design:
 *   Entity  — features declare entities; the host merges them into a
 *             registry. The SDK only provides the core Relation entity.
 *   RelKind — domain-specific relation kinds are registered by the host.
 *             The SDK provides just the Custom() helper and open type.
 *───────────────────────────────────────────────────────────────────────────*/
export namespace EARS {
  // ─── Entity ────────────────────────────────────────────────────────────
  export const Entity = {
    Relation: 'Relation',
    Node: 'Node',
  } as const;

  export type Entity = typeof Entity[keyof typeof Entity] | (string & {});
  export type EntityId<E extends string = string> = `${string}-${string}` & { readonly __entity?: E };

  // ─── RelKind ───────────────────────────────────────────────────────────
  // Concrete values registered by the host; SDK provides just the type framework.
  const _relCustom = <T extends string>(k: T) => k as T & RelKind;

  export const RelKind = {
    INSTANCE_OF: 'instance_of',
    Custom: _relCustom,
  } as const;

  export type RelKind = string & {};

  // ─── Relations ─────────────────────────────────────────────────────────
  export interface RelationDetail {
    sourceEntity : EntityId;
    targetEntity : EntityId;
    relationType : RelKind;
    info?        : AttributeValue;
  }

  // ─── RoleKind ──────────────────────────────────────────────────────────
  const _roleCustom = <T extends string>(k: T) => k as T & RoleKind;

  export const RoleKind = {
    Custom: _roleCustom,
  } as const;

  export type RoleKind = string & {};

  // ─── AttrKind ──────────────────────────────────────────────────────────
  export const AttrKindValues = {
    Role            : 'role',
    RelationDetails : 'relationDetails',
  } as const;

  const _attrCustom = <T extends string>(k: T) => k as T & AttrKind;

  export const AttrKind = {
    ...AttrKindValues,
    Custom: _attrCustom,
  } as const;

  export type AttrKind = typeof AttrKindValues[keyof typeof AttrKindValues] | (string & {});

  // ─── Attribute payloads ────────────────────────────────────────────────
  export interface AttributePayloads {
    [AttrKindValues.Role]            : RoleKind;
    [AttrKindValues.RelationDetails] : RelationDetail;
    // biome-ignore lint/suspicious/noExplicitAny: fallback for user buckets
    [key: string]                    : any;
  }

  // biome-ignore lint/suspicious/noExplicitAny: generic fallback
  export type AttributeValue<K extends AttrKind = AttrKind> = K extends keyof AttributePayloads ? AttributePayloads[K] : any;

  export type AttributeTypeMap = Record<EntityId, AttributeValue[]>;

  export type AttributeType  = AttrKind;
  export type AttributeStore = Record<string, AttributeTypeMap>;

  // ─── Blueprint ─────────────────────────────────────────────────────────
  export type Blueprint = {
    entity : EARS.Entity;
    attrs? : Record<string, unknown>;
    roles? : EARS.RoleKind[];
    uniqueRoles? : EARS.RoleKind[];
    rels?  : { kind: EARS.RelKind; target: Blueprint | EARS.EntityId; info?: unknown }[];
  };
}

export interface BaseEntity {
  id: EARS.EntityId;
  entityType: EARS.Entity;
  createdAt: number;
  updatedAt?: number;
}

/**
 * Entity type name → attribute shape. There is no global registry: each pack's
 * `#generated/ears` defines its `PackShapes` (its own entities plus its dependencies')
 * and exports EARS helpers typed against it.
 */
export type EntityShapes = { [entityType: string]: object };

/**
 * An entity type's shape in `S`. A type `S` doesn't declare reads as its base fields plus
 * `unknown` values: never `any`, so undeclared data has to be narrowed before use.
 *
 * The check is wrapped in tuples to make it NON-distributive. A naked conditional
 * distributes over a union `E`, and because `keyof Record<string, any>` is
 * `string | number`, `keyof` of a union with any undeclared arm collapses to roughly
 * `keyof BaseEntity` — over-constraining every caller whose `E` is not a single
 * declared literal.
 */
export type ShapeOf<S extends EntityShapes, E extends string> =
  [E] extends [keyof S]
    ? S[E] & BaseEntity
    : BaseEntity & Record<string, unknown>;
