/*───────────────────────────────────────────────────────────────────────────
 * App-level EARS namespace
 *
 * Composes the full EARS type by combining:
 *   - SDK infrastructure types (AttrKind, Blueprint, BaseEntity, etc.)
 *   - Entity enum — registered from feature entity declarations
 *   - RelKind values — domain-specific relation kinds for this host
 *
 * The Entity enum must be manually kept in sync with AllEntities.
 * The compile-time assertions at the bottom catch any drift.
 *───────────────────────────────────────────────────────────────────────────*/
import { EARS as CoreEARS } from '@abuddy/sdk';
import { AllEntities } from './entities';

export { AllEntities };

// ─── RelKind values (domain-specific, registered here) ────────────────────
const RelKindValues = {
  PARENT_OF      : 'parent_of',
  CONTAINS       : 'contains',
  REPLIED_TO     : 'replied_to',
  HAS            : 'has',
  BLOCKS         : 'blocks',
  DEPENDS_ON     : 'depends_on',
  RELATES_TO     : 'relates_to',
  DUPLICATES     : 'duplicates',
  TRANSITIONS_TO : 'transitions_to',
  EMITS          : 'emits',
  INSTANCE_OF    : 'instance_of',
  SPAWNED        : 'spawned',
  TRACKED        : 'tracked',
} as const;

type RegisteredRelKind = typeof RelKindValues[keyof typeof RelKindValues];

// ─── Composed EARS namespace ──────────────────────────────────────────────
export namespace EARS {
  // ── Registered: Entity enum (from feature declarations) ────────────────
  export enum Entity {
    Agent           = 'Agent',
    Brain           = 'Brain',
    Message         = 'Message',
    Thread          = 'Thread',
    Relation        = 'Relation',
    Artifact        = 'Artifact',
    Flow            = 'Flow',
    Node            = 'Node',
    TNode           = 'TNode',
    Prompt          = 'Prompt',
    Action          = 'Action',
    Document        = 'Document',
    Collection      = 'Collection',
    SearchIndex     = 'SearchIndex',
    IndexedDoc      = 'IndexedDoc',
    Terminal        = 'Terminal',
    Directory       = 'Directory',
    Settings        = 'Settings',
    FAQ             = 'FAQ',
    Secret          = 'Secret',
    Note            = 'Note',
    BrowserTab      = 'BrowserTab',
    BrowserBookmark = 'BrowserBookmark',
    CalendarEvent   = 'CalendarEvent',
  }
  export type EntityId = CoreEARS.EntityId;

  // ── Registered: RelKind values ─────────────────────────────────────────
  const _relCustom = <T extends string>(k: T) => k as T & RelKind;
  export const RelKind = {
    ...RelKindValues,
    Custom: _relCustom,
  } as const;
  export type RelKind = RegisteredRelKind | (string & {});

  // ── SDK infrastructure (delegated, not duplicated) ─────────────────────
  const _roleCustom = <T extends string>(k: T) => k as T & RoleKind;
  export const RoleKind = { Custom: _roleCustom } as const;
  export type RoleKind = CoreEARS.RoleKind;

  export const AttrKindValues = CoreEARS.AttrKindValues;
  const _attrCustom = <T extends string>(k: T) => k as T & AttrKind;
  export const AttrKind = {
    ...CoreEARS.AttrKindValues,
    Custom: _attrCustom,
  } as const;
  export type AttrKind = CoreEARS.AttrKind;

  export type RelationDetail = CoreEARS.RelationDetail;
  export type AttributePayloads = CoreEARS.AttributePayloads;
  // biome-ignore lint/suspicious/noExplicitAny: generic fallback
  export type AttributeValue<K extends AttrKind = AttrKind> =
    K extends keyof AttributePayloads ? AttributePayloads[K] : any;
  export type AttributeTypeMap = CoreEARS.AttributeTypeMap;
  export type AttributeType = CoreEARS.AttributeType;
  export type AttributeStore = CoreEARS.AttributeStore;
  export type Blueprint = CoreEARS.Blueprint;
}

export interface BaseEntity {
  id: EARS.EntityId;
  entityType: EARS.Entity;
  createdAt: number;
  updatedAt?: number;
}

// ── Compile-time sync: Entity enum ↔ AllEntities registry ────────────────
type _RegistryKeys = keyof typeof AllEntities;
type _EnumKeys = keyof typeof EARS.Entity;
type _AssertRegistrySubsetOfEnum = _RegistryKeys extends _EnumKeys ? true : ['ERROR: registry entity missing from enum', Exclude<_RegistryKeys, _EnumKeys>];
type _AssertEnumSubsetOfRegistry = _EnumKeys extends _RegistryKeys ? true : ['ERROR: enum entity missing from registry', Exclude<_EnumKeys, _RegistryKeys>];
void (true as _AssertRegistrySubsetOfEnum);
void (true as _AssertEnumSubsetOfRegistry);
