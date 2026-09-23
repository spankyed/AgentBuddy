// Framework
export { defineSystem, type SystemSpec, type SystemEvents } from './framework/index.ts';

// Helpers
export { safeEvents } from './helpers/index.ts';
export type { Simplify } from './helpers/index.ts';

// Types
export {
  EARS, type SdkEntityShapes, type RelationEntity, type FlowEntity, type NodeBase, type TNodeEntity, type TNodeKind,
  type ActionEntity, type ActionParameter, type PromptEntity, type TemplateInput,
} from './types/index.ts';
export { ROOT_FLOW_ROLE } from './types/index.ts';

// Designations
export { getDesignated, hasDesignation } from './designations/index.ts';

