import { EARS } from '@/shared/ears/types';
import type { Rows } from '@/shared/types';

const nowMs = Date.now();

// export const flowRows: Rows = {
export const flowRows: Rows = {
  /*──────────────────────────────────────────*
   * Core entities                            *
   *──────────────────────────────────────────*/
  entity: [
    /* Graph container */
    {
      id: "Flow-1",
      entityType: EARS.Entity.Flow,
      createdAt: nowMs - 1_000,
      label: "Chat Flow",
      flowType: "workflow",
    },
    {
      id: "Flow-2",
      entityType: EARS.Entity.Flow,
      createdAt: nowMs - 1_000,
      label: "Some Flow with Validation",
      flowType: "workflow",
    },
    {
      id: "Flow-3",
      entityType: EARS.Entity.Flow,
      createdAt: nowMs - 1_000,
      label: "Some Flow",
      flowType: "workflow",
    },

    /* Event Listeners */
    {
      id: "Node-1",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "listen",
      label: "User Message",
      x: 100,
      y: 100,
      color: "#1E88E5", // blue
      mode: "entry",
      eventTag: "chat.message",
    },
    {
      id: "Node-2",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 890,
      nodeType: "listen",
      label: "System Events",
      x: 100,
      y: 300,
      color: "#1E88E5",
      mode: "internal",
      eventTag: "system.*",
    },

    /* Decision Nodes */
    {
      id: "Node-3",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 880,
      nodeType: "decision",
      label: "Message Type",
      x: 300,
      y: 100,
      color: "#FF9800", // orange
      conditions: [
        { expr: "type === 'question'", label: "Question" },
        { expr: "type === 'command'", label: "Command" },
        { expr: "type === 'chat'", label: "Chat" }
      ],
      elseLabel: "Unknown"
    },

    /* Variable Nodes */
    {
      id: "Node-4",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 870,
      nodeType: "create",
      label: "Create Context",
      x: 500,
      y: 50,
      color: "#9C27B0", // purple
      entityTypeTarget: EARS.Entity.Node,
    },
    {
      id: "Node-5",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 860,
      nodeType: "update",
      label: "Update Context",
      x: 500,
      y: 150,
      color: "#9C27B0",
      entityId: "Node-4",
    },

    /* Fire Events */
    {
      id: "Node-6",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 850,
      nodeType: "fire",
      label: "Send Response",
      x: 700,
      y: 100,
      color: "#F44336", // red
      eventTag: "chat.response",
      scope: "global",
    },

    /* Query Node */
    {
      id: "Node-8",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 830,
      nodeType: "query",
      label: "Get User Intent",
      x: 300,
      y: 300,
      color: "#2196F3", // blue
      prompt: "What is the user's intent?",
      resultKey: "intent",
    },

    /* Transform Node */
    {
      id: "Node-9",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 820,
      nodeType: "transform",
      label: "Format Response",
      x: 500,
      y: 300,
      color: "#4CAF50", // green
      script: "return { response: `Intent: ${context.intent}` }",
      outputType: "json",
    },

    /* Fire Node (for transform output) */
    {
      id: "Node-10",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 810,
      nodeType: "fire",
      label: "Log Intent",
      x: 700,
      y: 300,
      color: "#F44336",
      eventTag: "system.intent",
      scope: "global",
    },

    /* Flow Node */
    {
      id: "Node-11",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 800,
      nodeType: "flow",
      label: "Command Handler",
      x: 500,
      y: 200,
      color: "#9C27B0",
      flowRef: "command-flow-1",
      propagateCtx: true,
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
    { source: "Flow-1", kind: EARS.RelKind.CONTAINS, target: "Node-6", info: {} },
    { source: "Flow-1", kind: EARS.RelKind.CONTAINS, target: "Node-8", info: {} },
    { source: "Flow-1", kind: EARS.RelKind.CONTAINS, target: "Node-9", info: {} },
    { source: "Flow-1", kind: EARS.RelKind.CONTAINS, target: "Node-10", info: {} },
    { source: "Flow-1", kind: EARS.RelKind.CONTAINS, target: "Node-11", info: {} },

    /* Listen node outputs */
    { source: "Node-1", kind: EARS.RelKind.CONSUMED_BY, target: "Node-3", info: {} },
    // { source: "Node-1", kind: EARS.RelKind.CONSUMED_BY, target: "Node-4", info: {} },
    { source: "Node-2", kind: EARS.RelKind.CONSUMED_BY, target: "Node-8", info: {} },

    /* Decision node outputs */
    { source: "Node-3", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-4", info: { condition: "Question" } },
    { source: "Node-3", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-11", info: { condition: "Command" } },
    
    /* Flow node */
    { source: "Node-11", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-5", info: {} },
    /* Variable node chain */
    { source: "Node-4", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-5", info: {} },
    { source: "Node-5", kind: EARS.RelKind.EMITS, target: "Node-6", info: {} },

    /* Query-Transform-Fire chain */
    { source: "Node-8", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-9", info: {} },
    { source: "Node-9", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-10", info: {} },

  ],
};