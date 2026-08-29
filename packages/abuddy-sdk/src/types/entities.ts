/*───────────────────────────────────────────────────────────────────────────
 * EARS entities, relations, roles & attributes
 *
 * Entity is an open type — features declare their entities in pack.config.ts
 * and the host assembles them via a registry. The SDK provides only the core
 * Relation entity; the full set is composed at the app level.
 *───────────────────────────────────────────────────────────────────────────*/
export namespace EARS {
  export const Entity = {
    Relation: 'Relation',
  } as const;

  export type Entity = typeof Entity[keyof typeof Entity] | (string & {});
  export type EntityId = `${string}-${string}`;

  const RelKindValues = {
    PARENT_OF   : 'parent_of',
    CONTAINS   : 'contains',
    REPLIED_TO : 'replied_to',
    HAS: 'has',
    BLOCKS     : 'blocks',
    DEPENDS_ON : 'depends_on',
    RELATES_TO : 'relates_to',
    DUPLICATES: 'duplicates',
    TRANSITIONS_TO: 'transitions_to',
    EMITS: 'emits',
    INSTANCE_OF    : 'instance_of',
    SPAWNED    : 'spawned',
    TRACKED    : 'tracked',
  } as const;

  const _relCustom = <T extends string>(k: T) => k as T & RelKind;

  export const RelKind = {
    ...RelKindValues,
    Custom: _relCustom,
  } as const;

  export type RelKind = typeof RelKindValues[keyof typeof RelKindValues] | (string & {});

  export interface RelationDetail {
    sourceEntity : EntityId;
    targetEntity : EntityId;
    relationType : RelKind;
    info?        : AttributeValue;
  }

  const RoleKindValues = {} as const;

  const _roleCustom = <T extends string>(k: T) => k as T & RoleKind;

  export const RoleKind = {
    ...RoleKindValues,
    Custom: _roleCustom,
  } as const;

  export type RoleKind = typeof RoleKindValues[keyof typeof RoleKindValues] | (string & {});

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

  export interface AttributePayloads {
    [AttrKindValues.Role]            : RoleKind;
    [AttrKindValues.RelationDetails] : RelationDetail;
    [key: string]                    : any;
  }

  export type AttributeValue<K extends AttrKind = AttrKind> = K extends keyof AttributePayloads ? AttributePayloads[K] : any;

  export type AttributeTypeMap = Record<EntityId, AttributeValue[]>;

  export type AttributeType  = AttrKind;
  export type AttributeStore = Record<string, AttributeTypeMap>;

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
