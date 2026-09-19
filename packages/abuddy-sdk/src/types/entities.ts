/*───────────────────────────────────────────────────────────────────────────
 * The SDK's EARS namespace: the engine's (@abuddy/ears) with the entity types
 * and relation kinds the SDK owns (sdk-entities.ts). Packs add theirs in their
 * generated EARS.
 *
 * CHANGE CONTROL: these types are a specified contract, and editor completions and error messages
 * depend on their exact form. Don't change them to make one call site compile; fix the call site.
 * Read packages/abuddy-sdk/TYPED-EARS.md (the contract and the pre-change checklist) first.
 *───────────────────────────────────────────────────────────────────────────*/
import { EARS as Core } from '@abuddy/ears';
import { SDK_ENTITIES, SDK_REL_KINDS } from './sdk-entities.ts';

export namespace EARS {
  // ─── Entity ────────────────────────────────────────────────────────────
  // The SDK's own entities (the engine's Relation among them); packs add theirs in their generated EARS
  export const Entity = SDK_ENTITIES;

  export type Entity = typeof Entity[keyof typeof Entity] | (string & {});
  export type EntityId<E extends string = string> = Core.EntityId<E>;

  // ─── RelKind ───────────────────────────────────────────────────────────
  export const RelKind = {
    ...SDK_REL_KINDS,
    Custom: Core.RelKind.Custom,
  } as const;

  export type RelKind = Core.RelKind;

  // ─── Shared engine types ───────────────────────────────────────────────
  export type RelationDetail = Core.RelationDetail;

  export const RoleKind = Core.RoleKind;
  export type RoleKind = Core.RoleKind;

  export const AttrKindValues = Core.AttrKindValues;
  export const AttrKind = Core.AttrKind;
  export type AttrKind = Core.AttrKind;

  export type AttributePayloads = Core.AttributePayloads;
  export type AttributeValue<K extends AttrKind = AttrKind> = Core.AttributeValue<K>;
  export type AttributeTypeMap = Core.AttributeTypeMap;
  export type AttributeType = Core.AttributeType;
  export type AttributeStore = Core.AttributeStore;

  export type Blueprint = Core.Blueprint;
}
