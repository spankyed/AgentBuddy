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
      id: "Step-1",
      entityType: EARS.Entity.Step,
      createdAt: nowMs - 900,
      stepType: "event-listener",
      label: "User Input",
      x: 120,
      y: 80,
    },
    {
      id: "Step-2",
      entityType: EARS.Entity.Step,
      createdAt: nowMs - 800,
      stepType: "transform",
      label: "Parse Intent",
      x: 320,
      y: 160,
    },
    {
      id: "Step-3",
      entityType: EARS.Entity.Step,
      createdAt: nowMs - 700,
      stepType: "llm",
      label: "LLM Call",
      prompt:
        "Generate a helpful response using the parsed intent: {{intent}}",
      x: 520,
      y: 160,
    },
    {
      id: "Step-4",
      entityType: EARS.Entity.Step,
      createdAt: nowMs - 600,
      stepType: "response",
      label: "Summarize",
      x: 720,
      y: 240,
    },

    /* Event topic */
    {
      id: "FlowEvent-1",
      entityType: EARS.Entity.FlowEvent,
      createdAt: nowMs - 750,
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
      role: EARS.RoleKind.Custom("open_graph"),
    },
    {
      entityId: "Step-2",
      role: EARS.RoleKind.Custom("selected_Step"),
    },
    {
      entityId: "Step-3",
      role: EARS.RoleKind.Custom("latest_Step"),
    },
  ],

  /*──────────────────────────────────────────*
   * Relationships                            *
   *──────────────────────────────────────────*/
  relation: [
    /* Graph containment */
    { srcId: "Flow-1", kind: EARS.RelKind.CONTAINS, tgtId: "Step-1", info: "{}" },
    { srcId: "Flow-1", kind: EARS.RelKind.CONTAINS, tgtId: "Step-2", info: "{}" },
    { srcId: "Flow-1", kind: EARS.RelKind.CONTAINS, tgtId: "Step-3", info: "{}" },
    { srcId: "Flow-1", kind: EARS.RelKind.CONTAINS, tgtId: "Step-4", info: "{}" },
    { srcId: "Flow-1", kind: EARS.RelKind.CONTAINS, tgtId: "FlowEvent-1", info: "{}" },

    /* Solid data-flow edges */
    { srcId: "Step-1", kind: EARS.RelKind.TRANSITIONS_TO, tgtId: "Step-2", info: "{}" },
    { srcId: "Step-2", kind: EARS.RelKind.TRANSITIONS_TO, tgtId: "Step-3", info: "{}" },
    { srcId: "Step-3", kind: EARS.RelKind.TRANSITIONS_TO, tgtId: "Step-4", info: "{}" },

    /* Event wiring (dashed) */
    { srcId: "Step-2", kind: EARS.RelKind.EMITS, tgtId: "FlowEvent-1", info: "{}" },
    { srcId: "FlowEvent-1", kind: EARS.RelKind.CONSUMED_BY, tgtId: "Step-3", info: "{}" },
  ],
} as const;