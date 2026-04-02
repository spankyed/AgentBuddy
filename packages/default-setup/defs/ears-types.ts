/*───────────────────────────────────────────────────────────────────────────
 * EARS types – Vendored subset from AgentBuddy/packages/api/src/core/types.ts
 *───────────────────────────────────────────────────────────────────────────*/
export namespace EARS {
  export enum Entity {
    Agent    = 'Agent',
    Brain    = 'Brain',
    Message  = 'Message',
    Thread   = 'Thread',
    Relation = 'Relation',
    Artifact = 'Artifact',
    Flow = 'Flow',
    Node = 'Node',
    TNode = 'TNode',
    Prompt = 'Prompt',
    Action = 'Action',
    Document = 'Document',
    Collection = 'Collection',
    SearchIndex = 'SearchIndex',
    IndexedDoc = 'IndexedDoc',
    Terminal = 'Terminal',
    Directory = 'Directory',
    Settings = 'Settings',
    FAQ = 'FAQ',
    Secret = 'Secret',
    Note = 'Note',
  }
  export type EntityId = `${Entity}-${string}`;

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
