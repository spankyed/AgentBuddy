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
      label: "Chat Flow with Validation",
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
    {
      id: "Node-7",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 840,
      nodeType: "fire",
      label: "Log Event",
      x: 700,
      y: 200,
      color: "#F44336",
      eventTag: "system.log",
      scope: "local",
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
    { source: "Flow-1", kind: EARS.RelKind.CONTAINS, target: "Node-7", info: {} },

    /* Test Listen node with multiple outputs */
    { source: "Node-1", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-3", info: {} },
    { source: "Node-1", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-4", info: {} },

    /* Test Decision node with multiple outputs */
    { source: "Node-3", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-6", info: { condition: "Question" } },
    { source: "Node-3", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-5", info: { condition: "Command" } },
    { source: "Node-3", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-7", info: { condition: "Unknown" } },

    /* Test Variable node connections */
    { source: "Node-4", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-6", info: {} },
    { source: "Node-5", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-7", info: {} },
  ],
};