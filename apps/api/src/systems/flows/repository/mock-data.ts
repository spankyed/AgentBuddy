import { EARS } from '@/shared/ears/types';
import type { Rows } from '@/shared/types';

const nowMs = Date.now();

// export const flowRows: Rows = {
export const flowRows = {
  /*──────────────────────────────────────────*
   * Core entities                            *
   *──────────────────────────────────────────*/
  entity: [
    /* Graph container */
    {
      id: "Flow-1",
      entityType: EARS.Entity.Flow,
      createdAt: nowMs - 1_000,
      label: "Example Dialog Flow",
      flowType: "workflow",
    },

    /* Steps */
    {
      id: "Node-1",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "event-listener",
      label: "User Input",
      x: 120,
      y: 80,
      color: "blue",
    },
    {
      id: "Node-2",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 800,
      nodeType: "transform",
      label: "Parse Intent",
      x: 320,
      y: 160,
    },
    {
      id: "Node-3",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 700,
      nodeType: "llm",
      label: "LLM Call",
      prompt:
        "Generate a helpful response using the parsed intent: {{intent}}",
      x: 520,
      y: 160,
    },
    {
      id: "Node-4",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 600,
      nodeType: "response",
      label: "Summarize",
      x: 720,
      y: 240,
    },

    /* Event topic */
    {
      id: "Node-5",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 750,
      nodeType: "event-listener",
      label: "client_connected",
      color: "purple",
    },
  ],

  /*──────────────────────────────────────────*
   * Role assignments (fake UI states)        *
   *──────────────────────────────────────────*/
  role: [
    {
      entityId: "Flow-1",
      role: EARS.RoleKind.Custom("root_flow"),
    },
    {
      entityId: "Node-2",
      role: EARS.RoleKind.Custom("selected_node"),
    },
    {
      entityId: "Node-3",
      role: EARS.RoleKind.Custom("latest_node"),
    },
  ],

  /*──────────────────────────────────────────*
   * Relationships                            *
   *──────────────────────────────────────────*/
  relation: [
    /* Graph containment */
    { source: "Flow-1", kind: EARS.RelKind.CONTAINS, target: "Node-1", info: {} },
    { source: "Flow-1", kind: EARS.RelKind.CONTAINS, target: "Node-2", info: {} },
    { source: "Flow-1", kind: EARS.RelKind.CONTAINS, target: "Node-3", info: {} },
    { source: "Flow-1", kind: EARS.RelKind.CONTAINS, target: "Node-4", info: {} },
    { source: "Flow-1", kind: EARS.RelKind.CONTAINS, target: "Node-5", info: {} },

    /* Solid data-flow edges */
    { source: "Node-1", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-2", info: {} },
    { source: "Node-2", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-3", info: {} },
    { source: "Node-3", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-4", info: {} },

    /* Event wiring (dashed) */
    { source: "Node-2", kind: EARS.RelKind.EMITS, target: "Node-5", info: {} },
    { source: "Node-5", kind: EARS.RelKind.CONSUMED_BY, target: "Node-3", info: {} },
  ],
} as const;