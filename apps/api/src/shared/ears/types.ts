/*───────────────────────────────────────────────────────────────────────────
 * types.ts – EARS entities, relations, roles & attributes (rev‑4)
 *───────────────────────────────────────────────────────────────────────────*/

export namespace EARS {
  /*-------------------------------------------------------------------------*\
  | 1 ▸ Entity identifiers                                                   |
  \*-------------------------------------------------------------------------*/
  export enum Entity {
    Agent    = 'Agent',
    Brain    = 'Brain',
    Message  = 'Message',
    Thread   = 'Thread',
    Tag      = 'Tag',
    Relation = 'Relation',
    ContextItem  = 'ContextItem',
    CanvasItem = 'CanvasItem',
    Flow = 'Flow',
    Node = 'Node',
    // Task     = 'Task',
  }
  export type EntityId = `${Entity}-${string}`;

  /*-------------------------------------------------------------------------*\
  | 2 ▸ Relation kinds                                                       |
  \*-------------------------------------------------------------------------*/
  const RelKindValues = {
    PARENT_OF   : 'parent_of',
    CONTAINS   : 'contains',
    SPAWNED    : 'spawned',
    REPLIED_TO : 'replied_to',
    HAS: 'has',
    
    TRANSITIONS_TO: 'transitions_to',
    CONSUMED_BY: 'consumed_by',
    EMITS: 'emits',
    
    BLOCKS     : 'blocks',
    DEPENDS_ON : 'depends_on',
    RELATES_TO : 'relates_to',
    DUPLICATES : 'duplicates',
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

  /*-------------------------------------------------------------------------*\
  | 3 ▸ Role kinds  (attribute "role" payload)                               |
  \*-------------------------------------------------------------------------*/
  const RoleKindValues = {
    // Last        : 'last',
  } as const;

  const _roleCustom = <T extends string>(k: T) => k as T & RoleKind;

  export const RoleKind = {
    ...RoleKindValues,
    Custom: _roleCustom,
  } as const;

  export type RoleKind = typeof RoleKindValues[keyof typeof RoleKindValues] | (string & {});

  /*-------------------------------------------------------------------------*\
  | 4 ▸ Attribute kinds & payloads                                           |
  \*-------------------------------------------------------------------------*/
  export const AttrKindValues = {
    Role            : 'role',          // payload ⇒ RoleKind
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
    // biome-ignore lint/suspicious/noExplicitAny: fallback for user buckets
    [key: string]                    : any;
  }

  // biome-ignore lint/suspicious/noExplicitAny: generic fallback
  export type AttributeValue<K extends AttrKind = AttrKind> = K extends keyof AttributePayloads ? AttributePayloads[K] : any;

  export type AttributeTypeMap = Record<EntityId, AttributeValue[]>;

  /*-------------------------------------------------------------------------*\
  | 5 ▸ Compat aliases                                                       |
  \*-------------------------------------------------------------------------*/
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
