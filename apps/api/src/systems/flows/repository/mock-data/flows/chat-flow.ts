import { EARS } from '@/shared/ears/types';
import type { Rows } from '@/shared/types';

const nowMs = Date.now();

export const chatFlow: Rows = {
  /*──────────────────────────────────────────*
   * Core entities                            *
   *──────────────────────────────────────────*/
  entity: [
    /* Graph container */
    {
      id: "Flow-b",
      shortCode: "F-b",
      entityType: EARS.Entity.Flow,
      createdAt: nowMs - 1_000,
      label: "Chat Flow",
      flowType: "workflow",
    },

    /* Event Listeners */
    {
      id: "Node-b1",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "listen",
      label: "User Message",
      x: 100,
      y: 100,
      color: "#1E88E5", // blue
      mode: "entry",
      eventType: "chat.message",
    },
    {
      id: "Node-b2",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 890,
      nodeType: "listen",
      label: "System Events",
      x: 100,
      y: 300,
      color: "#1E88E5",
      mode: "internal",
      eventType: "system.*",
    },

    /* Decision Nodes */
    {
      id: "Node-b3",
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
      id: "Node-b4",
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
      id: "Node-b5",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 860,
      nodeType: "update",
      label: "Update Context",
      x: 500,
      y: 150,
      color: "#9C27B0",
      entityId: "Node-b4",
    },

    /* Fire Events */
    {
      id: "Node-b6",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 850,
      nodeType: "fire",
      label: "Send Response",
      x: 700,
      y: 100,
      color: "#F44336", // red
      eventType: "chat.response",
      scope: "global",
    },

    /* Query Node */
    {
      id: "Node-b8",
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
      id: "Node-b9",
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
      id: "Node-b10",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 810,
      nodeType: "fire",
      label: "Log Intent",
      x: 700,
      y: 300,
      color: "#F44336",
      eventType: "system.intent",
      scope: "global",
    },

    /* Flow Node */
    {
      id: "Node-b11",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 800,
      nodeType: "flow",
      label: "Command Handler",
      x: 500,
      y: 200,
      color: "#9C27B0",
      flowRef: "command-flow-3",
      propagateCtx: true,
    },
  ],

  /*──────────────────────────────────────────*
   * Role assignments (fake UI states)        *
   *──────────────────────────────────────────*/
  role: [
    {
      entityId: "Node-b2",
      role: EARS.RoleKind.Custom("selected_node"),
    },
    {
      entityId: "Node-b3",
      role: EARS.RoleKind.Custom("latest_node"),
    },
  ],

  /*──────────────────────────────────────────*
   * Relationships                            *
   *──────────────────────────────────────────*/
  relation: [
    /* Graph containment */
    { source: "Flow-b", kind: EARS.RelKind.CONTAINS, target: "Node-b1", info: {} },
    { source: "Flow-b", kind: EARS.RelKind.CONTAINS, target: "Node-b2", info: {} },
    { source: "Flow-b", kind: EARS.RelKind.CONTAINS, target: "Node-b3", info: {} },
    { source: "Flow-b", kind: EARS.RelKind.CONTAINS, target: "Node-b4", info: {} },
    { source: "Flow-b", kind: EARS.RelKind.CONTAINS, target: "Node-b5", info: {} },
    { source: "Flow-b", kind: EARS.RelKind.CONTAINS, target: "Node-b6", info: {} },
    { source: "Flow-b", kind: EARS.RelKind.CONTAINS, target: "Node-b8", info: {} },
    { source: "Flow-b", kind: EARS.RelKind.CONTAINS, target: "Node-b9", info: {} },
    { source: "Flow-b", kind: EARS.RelKind.CONTAINS, target: "Node-b10", info: {} },
    { source: "Flow-b", kind: EARS.RelKind.CONTAINS, target: "Node-b11", info: {} },

    /* Listen node outputs */
    { source: "Node-b1", kind: EARS.RelKind.CONSUMED_BY, target: "Node-b3", info: {} },
    // { source: "Node-b1", kind: EARS.RelKind.CONSUMED_BY, target: "Node-b4", info: {} },
    { source: "Node-b2", kind: EARS.RelKind.CONSUMED_BY, target: "Node-b8", info: {} },

    /* Decision node outputs */
    { source: "Node-b3", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-b4", info: { condition: "Question" } },
    { source: "Node-b3", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-b11", info: { condition: "Command" } },
    
    /* Flow node */
    { source: "Node-b11", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-b5", info: {} },
    /* Variable node chain */
    { source: "Node-b4", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-b5", info: {} },
    { source: "Node-b5", kind: EARS.RelKind.EMITS, target: "Node-b6", info: {} },

    /* Query-Transform-Fire chain */
    { source: "Node-b8", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-b9", info: {} },
    { source: "Node-b9", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-b10", info: {} },
  ],
}; 