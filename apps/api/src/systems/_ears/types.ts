/*───────────────────────────────────────────────────────────────────────────
 * types.ts – ECS core & attribute vocabulary (rev‑2 with AttrKind.Custom)
 *───────────────────────────────────────────────────────────────────────────*/

/*-------------------------------------------------------------------------*\
| 1 ▸ Core ECS entity identifiers                                           |
\*-------------------------------------------------------------------------*/
export namespace ECS {
  export enum Entity {
    Message  = 'Message',
    Thread   = 'Thread',
    Relation = 'Relation',
    Task     = 'Task',
  }
  export type EntityId = `${Entity}-${string}`;
  export interface RelationDetail {
    sourceEntity : EntityId;
    targetEntity : EntityId;
    relationType : string;
    info?        : AttributeValue;
  }
  export type AttributeTypeMap = Record<EntityId, AttributeValue[]>;

  /*-------------------------------------------------------------------------*\
  | 2 ▸ Attribute kinds & payload typings                                     |
  \*-------------------------------------------------------------------------*/
  /** Canonical bucket names */
  export const AttrKindValues = {
    Role            : 'role',
    RelationDetails : 'relationDetails',
  } as const;

  /** Helper to mint user‑defined bucket names at call‑site */
  const _custom = <T extends string>(k: T) => k as T & AttrKind;

  export const AttrKind = {
    ...AttrKindValues,
    Custom: _custom,
  } as const;

  export type AttrKind = typeof AttrKindValues[keyof typeof AttrKindValues] | (string & {});

  /** Payload mapping for first‑class buckets; extend per‑app */
  export interface AttributePayloads {
    [AttrKindValues.Role]            : string;
    [AttrKindValues.RelationDetails] : ECS.RelationDetail;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    [key: string]                    : any; // fallback for custom kinds
  }

  export type AttributeValue<K extends AttrKind = AttrKind> =
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    K extends keyof AttributePayloads ? AttributePayloads[K] : any;

  /*-------------------------------------------------------------------------*\
  | 3 ▸ Compatibility re‑exports                                              |
  \*-------------------------------------------------------------------------*/
  export type AttributeType  = AttrKind;
  export type AttributeStore = Record<string, ECS.AttributeTypeMap>;
}
