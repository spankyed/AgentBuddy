import { EARS } from '@/core/types';
import type { Rows } from '@/core/data';

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
      nodeType: "listener",
      label: "User Message",
      scope: "global",
      eventType: "chat.message",
    },
    {
      id: "Node-b2",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 890,
      nodeType: "listener",
      label: "System Events",
      scope: "local",
      eventType: "system.*",
    },

    /* Switch Nodes */
    {
      id: "Node-b3",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 880,
      nodeType: "switch",
      label: "Message Type",
      conditions: [
        { predicate: { key: '$.type', operator: 'equals', value: 'question' }, label: "Question" },
        { predicate: { key: '$.type', operator: 'equals', value: 'command' }, label: "Command" },
        { predicate: { key: '$.type', operator: 'equals', value: 'chat' }, label: "Chat" },
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
      entityTypeTarget: EARS.Entity.Node,
    },
    {
      id: "Node-b5",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 860,
      nodeType: "update",
      label: "Update Context",
      entityId: "Node-b4",
    },

    /* Fire Events */
    {
      id: "Node-b6",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 850,
      nodeType: "fire",
      label: "Send Response",
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
      role: EARS.RoleKind.Custom("final_node"),
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

    /* Listener node outputs */
    { source: "Node-b1", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-b3", info: {} },
    // { source: "Node-b1", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-b4", info: {} },
    { source: "Node-b2", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-b8", info: {} },

    /* Switch node outputs */
    { source: "Node-b3", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-b4", info: { sourceHandle: "branch-0" } },
    { source: "Node-b3", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-b11", info: { sourceHandle: "branch-1" } },
    
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