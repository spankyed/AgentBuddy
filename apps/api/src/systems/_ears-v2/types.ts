/*───────────────────────────────────────────────────────────────────────────
 * types.ts – ECS core & attribute vocabulary (rev‑1)
 *───────────────────────────────────────────────────────────────────────────*/

/*-------------------------------------------------------------------------*\
| 1 ▸ Core ECS entity identifiers                                           |
\*-------------------------------------------------------------------------*/
export namespace ECS {
  /** Top‑level entity categories */
  export enum Entity {
    Message  = 'Message',
    Thread   = 'Thread',
    Relation = 'Relation',
    Task     = 'Task',
  }

  /** Compile‑time guarantee that IDs carry their prefix, e.g. `Task‑42` */
  export type EntityId = `${Entity}-${string}`;

  /**   Internal payload describing a Relation entity */
  export interface RelationDetail {
    sourceEntity : EntityId;
    targetEntity : EntityId;
    relationType : string;
    info?        : AttributeValue;
  }

  /** Map from a *single* entity to all values of a bucket */
  export type AttributeTypeMap = Record<EntityId, AttributeValue[]>;
}

/*-------------------------------------------------------------------------*\
| 2 ▸ Attribute kinds & payload typings                                     |
\*-------------------------------------------------------------------------*/
/** Well‑known bucket names (string‑literal union) */
export const AttrKind = {
  Role            : 'role',
  RelationDetails : 'relationDetails',
} as const;

export type AttrKind = typeof AttrKind[keyof typeof AttrKind] | (string & {});

/** Strong payload mapping for first‑class buckets */
export interface AttributePayloads {
  [AttrKind.Role]            : string;                 // user‑defined label
  [AttrKind.RelationDetails] : ECS.RelationDetail;     // struct defined above
  /** fallback for custom kinds */
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    [key: string]              : any;
}

export type AttributeValue<K extends AttrKind = AttrKind> =
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  K extends keyof AttributePayloads ? AttributePayloads[K] : any;

/*-------------------------------------------------------------------------*\
| 3 ▸ Convenience aliases                                                   |
\*-------------------------------------------------------------------------*/
export type AttributeType = AttrKind;  // expose for legacy imports

/* The store is Map‑backed in runtime code; this is kept only for helpers */
export type AttributeStore = Record<string, ECS.AttributeTypeMap>;

