import { EARS } from '@/core/types';
import type { Rows } from '@/core/data';
import { FlowEntity } from '@/types';
import { ContextPaths } from '@/systems/brain/types';

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
      scope: "entry",
      eventType: "flow.entry",
    },
    {
      id: "Node-a2",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "listen",
      label: "User Message",
      scope: "local",
      eventType: "user.message",
      // Expected event structure: { type: "user.message", payload: "message text", userId?: "123", context?: "additional info" }
    },
    {
      id: "Node-a3",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "listen",
      label: "Database Query Prompt",
      scope: "local",
      eventType: "database.query.prompt",
    },
    /* First Steps (connected via TRANSITIONS_TO) */
    {
      id: "Node-a4s",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "keep_alive",
      label: "Keep Alive",
    },
    {
      id: "Node-a5s",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "action",
      label: "save to db",
    },
    {
      id: "Node-a6s",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "llm",
      label: "LLM Call",
      model: "gpt-4",
      // prompt: "Respond with a query like `return qx(EARS.Entity.Thread).limit(10).pickAll();`",
    },
    /* Process User Message - Maps event payload to template params */
    {
      id: "Node-a7s",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "llm",
      label: "Process User Message",
      model: "gpt-4",
      promptTemplateId: "Prompt-user-message-analysis",
      fieldMappings: [
        {
          target: "userMessage",
          source: ContextPaths.EVENT_PAYLOAD,  // Maps event.data.payload to userMessage
          default: "[No message provided]"
        },
        {
          target: "additionalContext",
          source: "$.event.data.context",      // Maps event.data.context if present
          default: "User is interacting with the agent brain system"
        }
      ],
    },
    {
      id: "Node-a8s",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "llm",
      label: "Format Response",
      model: "gpt-4",
      promptTemplateId: "Prompt-format-response",
      fieldMappings: [
        {
          target: "userMessage",
          source: ContextPaths.EVENT_PAYLOAD    // Original user message
        },
        {
          target: "analysisResult",
          source: ContextPaths.stepByLabel('Process User Message')  // Get result by step label
        },
        {
          target: "responseStyle",
          source: "$.event.data.responseStyle",
          default: "helpful and professional"
        }
      ],
    },

    /* Log Message Action */
    {
      id: "Node-loa8s",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 860,
      nodeType: "action",
      label: "Stream to FE",
      actionId: "Action-stream-to-fe",
      fieldMappings: [
        {
          target: "message",
          source: ContextPaths.EVENT_PAYLOAD    // Original user message
        },
      ]
    },
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
    { source: "Flow-a", kind: EARS.RelKind.CONTAINS, target: "Node-loa8s", info: {} },

    { source: "Node-a1", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-a4s", info: {} },
    { source: "Node-a2", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-a7s", info: {} },
    { source: "Node-a3", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-a6s", info: {} },

    { source: "Node-a6s", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-a5s", info: {} },
    { source: "Node-a7s", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-a8s", info: {} },
    { source: "Node-a8s", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-loa8s", info: {} },
  ],
}; 