import { EARS } from "@/shared/ears/types";

/*─────────────────────────────────────────────────────────────────
 * Edge kinds used in flows
 *─────────────────────────────────────────────────────────────────*/
export const FLOW_EDGE_KINDS = [
  EARS.RelKind.TRANSITIONS_TO,
  EARS.RelKind.BLOCKS,
  EARS.RelKind.DEPENDS_ON,
] as const;

/*─────────────────────────────────────────────────────────────────
 * Custom roles
 *─────────────────────────────────────────────────────────────────*/
export const FLOW_ROLES = {
  ROOT_FLOW: EARS.RoleKind.Custom("root_flow"),
  ENTRY_EVENT: "entry_event",
} as const;

/*─────────────────────────────────────────────────────────────────
 * Default values
 *─────────────────────────────────────────────────────────────────*/
export const NODE_DEFAULTS = {
  TYPE: 'action' as const,
  LABEL: 'New Node',
  DESCRIPTION: '',
} as const;

export const FLOW_ENTRY_NODE = {
  TYPE: 'listen' as const,
  LABEL: 'Flow Entry',
  COLOR: '#1E88E5',
  MODE: 'entry' as const,
  EVENT_TYPE: 'flow.entry',
} as const;

export const FLOW_DEFAULTS = {
  TYPE: 'workflow' as const,
  DESCRIPTION: '',
} as const;

/*─────────────────────────────────────────────────────────────────
 * Field lists for queries
 *─────────────────────────────────────────────────────────────────*/
export const FLOW_QUERY_FIELDS = {
  LIST: ["id", "label", "flowType", "status", "createdAt"] as const,
  DETAIL: ["id", "label", "description", "flowType", "status", "createdAt", "updatedAt"] as const,
} as const;