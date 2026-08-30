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
  } as const;

  export type Entity = typeof Entity[keyof typeof Entity] | (string & {});
  export type EntityId = `${string}-${string}`;

  // ─── RelKind ───────────────────────────────────────────────────────────
  // Concrete values registered by the host; SDK provides just the type framework.
  const _relCustom = <T extends string>(k: T) => k as T & RelKind;

  export const RelKind = {
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
