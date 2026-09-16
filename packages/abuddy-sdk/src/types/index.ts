export { EARS, type BaseEntity, type EntityShapes, type ShapeOf } from './entities.ts';
export type {
  SdkEntityShapes, RelationEntity, FlowEntity, NodeBase, ActionEntity, ActionParameter, PromptEntity, TemplateInput,
  SettingsEntity, SettingsScope,
} from './sdk-entities.ts';
export type { TNodeEntity, TNodeKind } from '../steps/types.ts';
export { ROOT_FLOW_ROLE } from './sdk-entities.ts';
/** @internal Host-only: the SDK-owned entity types, relation kinds and storage routing */
export { SDK_ENTITIES, SDK_REL_KINDS, SDK_EXCLUDED_ENTITY_TYPES } from './sdk-entities.ts';
export type { KeyboardShortcut, CustomHotkey, ApplicationHotkeys } from './keyboard.ts';
