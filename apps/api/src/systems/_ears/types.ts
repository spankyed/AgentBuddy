// types.ts  ── ultra‑light edition
export namespace ECS {
  /** High‑level kinds of entities you’ll create */
  export enum Entity {
    Scene     = 'Scene',
    Camera    = 'Camera',
    Light     = 'Light',
    Character = 'Character',
    Relation  = 'Relation',
    Task      = 'Task',
  }

  /**
   * Compile‑time guarantee that an ID carries its entity prefix,
   * e.g. `"Camera‑abc123"`.
   */
  export type EntityId = `${ECS.Entity}-${string}`;

  export interface RelationDetail {
    sourceEntity: ECS.EntityId;
    targetEntity: ECS.EntityId;
    relationType: string;
    info?: AttributeValue;
  }

  export type AttributeStore = Record<ECS.AttributeType, ECS.AttributeTypeMap>;
  export type AttributeTypeMap = Record<EntityId, AttributeValue[]>;
  
  /** Any string label is allowed as an attribute bucket */
  export type AttributeType  = string;

  /** Payload is generic/unknown—specialize locally if needed */
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    export type AttributeValue = any;

  /**
   * attributeStore[attributeType][entityId] -> AttributeValue[]
   */
}