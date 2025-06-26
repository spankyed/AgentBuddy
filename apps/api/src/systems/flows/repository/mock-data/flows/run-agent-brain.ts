import { EARS } from '@/shared/ears/types';
import type { Rows } from '@/shared/types';
import { FlowEntity } from '@/types';

const nowMs = Date.now();

const flow = {
  id: "Flow-a",
  shortCode: "F-a",
  entityType: EARS.Entity.Flow,
  createdAt: nowMs - 1_000,
  label: "Run Agent Brain",
  flowType: "workflow",
} as FlowEntity;

export const runAgentBrainFlow: Rows = {
  /*──────────────────────────────────────────*
   * Core entities                            *
   *──────────────────────────────────────────*/
  entity: [
    flow,
    /* Event Listeners */
    {
      id: "Node-a1",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "listen",
      label: "Flow Entry",
      x: 100,
      y: 100,
      color: "#1E88E5", // blue
      mode: "entry",
      eventType: "flow.entry",
    },
    {
      id: "Node-a2",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "listen",
      label: "User Message",
      x: 100,
      y: 100,
      color: "#1E88E5", // blue
      mode: "internal",
      eventType: "user.message",
    },
    {
      id: "Node-a3",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "listen",
      label: "Database Query Prompt",
      x: 100,
      y: 100,
      color: "#1E88E5", // blue
      mode: "internal",
      eventType: "database.query.prompt",
    },
    /* Responders */
    {
      id: "Node-a4s",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "keep_alive",
      label: "Keep Alive",
      x: 100,
      y: 100,
      color: "#1E88E5", // blue
    },
    {
      id: "Node-a5s",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "action",
      label: "save to db",
      actionName: "save_entity",
      x: 100,
      y: 100,
      color: "#1E88E5", // blue
    },
    {
      id: "Node-a6s",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "llm",
      label: "LLM Call",
      model: "gpt-4.1",
      prompt: "Respond with a query like `return qx(EARS.Entity.Thread).limit(10).pickAll();`",
      x: 100,
      y: 100,
      color: "#1E88E5", // blue
    },
    {
      id: "Node-a7s",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "llm",
      label: "Process User Message",
      model: "gpt-4",
      promptTemplateId: "user-message-analysis",
      promptTemplateParams: {
        additionalContext: "User is interacting with the agent brain system"
      },
      x: 100,
      y: 100,
      color: "#9C27B0", // purple
    },
    {
      id: "Node-a8s",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "llm",
      label: "Format Response",
      model: "gpt-4",
      promptTemplateId: "format-response",
      promptTemplateParams: {
        responseStyle: "helpful and professional"
      },
      x: 100,
      y: 100,
      color: "#4CAF50", // green
    }

    /* Steps */,
    
  ],

  /*──────────────────────────────────────────*
   * Role assignments                         *
   *──────────────────────────────────────────*/
  role: [
    {
      entityId: "Flow-a",
      role: EARS.RoleKind.Custom("root_flow"),
    },
    {
      entityId: "Node-a1",
      role: EARS.RoleKind.Custom("entry_event"),
    },
  ],

  /*──────────────────────────────────────────*
   * Relationships                            *
   *──────────────────────────────────────────*/
  relation: [
    { source: "Flow-a", kind: EARS.RelKind.CONTAINS, target: "Node-a1", info: {} },
    { source: "Flow-a", kind: EARS.RelKind.CONTAINS, target: "Node-a2", info: {} },
    { source: "Flow-a", kind: EARS.RelKind.CONTAINS, target: "Node-a3", info: {} },
    { source: "Flow-a", kind: EARS.RelKind.CONTAINS, target: "Node-a4s", info: {} },
    { source: "Flow-a", kind: EARS.RelKind.CONTAINS, target: "Node-a5s", info: {} },
    { source: "Flow-a", kind: EARS.RelKind.CONTAINS, target: "Node-a6s", info: {} },
    { source: "Flow-a", kind: EARS.RelKind.CONTAINS, target: "Node-a7s", info: {} },
    { source: "Flow-a", kind: EARS.RelKind.CONTAINS, target: "Node-a8s", info: {} },

    { source: "Flow-a", kind: EARS.RelKind.EVENT_TRACE, target: "Node-a1", info: {} },
    { source: "Flow-a", kind: EARS.RelKind.EVENT_TRACE, target: "Node-a2", info: {} },
    { source: "Flow-a", kind: EARS.RelKind.EVENT_TRACE, target: "Node-a3", info: {} },

    { source: "Node-a1", kind: EARS.RelKind.RESPONDER, target: "Node-a4s", info: {} },
    { source: "Node-a2", kind: EARS.RelKind.RESPONDER, target: "Node-a7s", info: {} },
    { source: "Node-a3", kind: EARS.RelKind.RESPONDER, target: "Node-a6s", info: {} },

    { source: "Node-a6s", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-a5s", info: {} },
    { source: "Node-a7s", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-a8s", info: {} },
  ],
}; 