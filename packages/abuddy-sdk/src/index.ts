// Framework
export { defineSystem, type SystemSpec, type SystemEvents } from './framework/index.ts';

// Helpers
export { safeEvents, emit } from './helpers/index.ts';
export type { Simplify } from './helpers/index.ts';

// Types
export {
  EARS, type BaseEntity, type SdkEntityShapes, type RelationEntity, type FlowEntity, type NodeBase, type TNodeEntity, type TNodeKind,
  type ActionEntity, type ActionParameter, type PromptEntity, type TemplateInput,
  type SettingsEntity, type SettingsScope,
} from './types/index.ts';
export { ROOT_FLOW_ROLE } from './types/index.ts';

// Designations
export { registerDesignations, getDesignated, hasDesignation } from './designations/index.ts';
export type { Designations } from './designations/index.ts';

// System IDs
export { bus } from './ids/index.ts';

// EARS runtime (pack-facing)
export { tx, defineEars, type EARSRuntimeDeps } from './ears/index.ts';
