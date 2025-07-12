import { EARS } from '@/core/types';
import type { Rows } from '@/core/mock-data';

const nowMs = Date.now();

export const actionDemoFlow: Rows = {
  /*──────────────────────────────────────────*
   * Core entities                            *
   *──────────────────────────────────────────*/
  entity: [
    /* Graph container */
    {
      id: "Flow-action-demo",
      shortCode: "F-action-demo",
      entityType: EARS.Entity.Flow,
      createdAt: nowMs - 1_000,
      label: "Action Demo Flow",
      description: "Demonstrates various action nodes",
      flowType: "workflow",
    },

    /* Entry Point - Listen for trigger */
    {
      id: "Node-ad1",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 900,
      nodeType: "listen",
      label: "Start Demo",
      mode: "entry",
      eventType: "demo.start",
    },

    /* Save Entity Action */
    {
      id: "Node-ad2",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 890,
      nodeType: "action",
      label: "Save User Data",
      params: {
        entityType: "User",
        data: {
          name: "Demo User",
          email: "demo@example.com",
          timestamp: nowMs
        }
      }
    },

    /* Send Email Action */
    {
      id: "Node-ad3",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 880,
      nodeType: "action",
      label: "Send Welcome Email",
      fieldMappings: [
        {
          target: "to",
          source: "$.lastStep.result.email",
          default: "fallback@example.com"
        },
        {
          target: "subject",
          source: "$.event.data.emailSubject",
          default: "Welcome to AgentBuddy!"
        },
        {
          target: "body",
          source: "$.event.data.emailBody",
          default: "Thank you for joining us!"
        }
      ]
    },

    /* HTTP Request Action */
    {
      id: "Node-ad4",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 870,
      nodeType: "action",
      label: "Call External API",
      params: {
        method: "POST",
        url: "https://api.example.com/notify",
        headers: {
          "Content-Type": "application/json"
        }
      },
      fieldMappings: [
        {
          target: "data",
          source: "$.steps[1].result", // Result from save entity
        }
      ]
    },

    /* Log Message Action */
    {
      id: "Node-ad5",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 860,
      nodeType: "action",
      label: "Log Results",
      params: {
        level: "info",
        message: "Demo flow completed successfully"
      },
      fieldMappings: [
        {
          target: "data",
          source: "$.steps",
          default: {}
        }
      ]
    },

    /* Fire completion event */
    {
      id: "Node-ad6",
      entityType: EARS.Entity.Node,
      createdAt: nowMs - 850,
      nodeType: "fire",
      label: "Demo Complete",
      eventType: "demo.complete",
      scope: "global",
      final: true,
    },
  ],

  /*──────────────────────────────────────────*
   * Role assignments                         *
   *──────────────────────────────────────────*/
  role: [],

  /*──────────────────────────────────────────*
   * Relationships                            *
   *──────────────────────────────────────────*/
  relation: [
    /* Flow contains all nodes */
    { source: "Flow-action-demo", kind: EARS.RelKind.CONTAINS, target: "Node-ad1" },
    { source: "Flow-action-demo", kind: EARS.RelKind.CONTAINS, target: "Node-ad2" },
    { source: "Flow-action-demo", kind: EARS.RelKind.CONTAINS, target: "Node-ad3" },
    { source: "Flow-action-demo", kind: EARS.RelKind.CONTAINS, target: "Node-ad4" },
    { source: "Flow-action-demo", kind: EARS.RelKind.CONTAINS, target: "Node-ad5" },
    { source: "Flow-action-demo", kind: EARS.RelKind.CONTAINS, target: "Node-ad6" },

    /* Node transitions */
    { source: "Node-ad1", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-ad2" },
    { source: "Node-ad2", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-ad3" },
    { source: "Node-ad3", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-ad4" },
    { source: "Node-ad4", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-ad5" },
    { source: "Node-ad5", kind: EARS.RelKind.TRANSITIONS_TO, target: "Node-ad6" },

    /* Node to Action relationships */
    { source: "Node-ad2", kind: EARS.RelKind.INSTANCE_OF, target: "Action-save-entity" },
    { source: "Node-ad3", kind: EARS.RelKind.INSTANCE_OF, target: "Action-send-email" },
    { source: "Node-ad4", kind: EARS.RelKind.INSTANCE_OF, target: "Action-http-request" },
    { source: "Node-ad5", kind: EARS.RelKind.INSTANCE_OF, target: "Action-log-message" },
  ],
};