export { EARS, type BaseEntity, type EntityShapes, type ShapeOf } from './entities.ts';
export type { RelationEntity, FlowEntity, ActionEntity, PromptEntity, SdkEntityShapes } from './sdk-entities.ts';
/** @internal Host-only: the SDK-owned entity types, relation kinds and persistence exclusions */
export { SDK_ENTITIES, SDK_REL_KINDS, SDK_EXCLUDED_ENTITY_TYPES } from './sdk-entities.ts';
export type { KeyboardShortcut, CustomHotkey, ApplicationHotkeys } from './keyboard.ts';
