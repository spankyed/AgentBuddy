import type { FlowDSL } from '../types';
import { entry, on, keepAlive, action, branch } from './_patterns';

/**
 * Hermes Agent flow.
 *
 * Routes user messages in hermes mode to the chat action, stream lifecycle
 * events to a unified lifecycle handler, and /h-* commands to the command
 * router.
 */
export default {
  "Hermes Agent": [
    entry([keepAlive()]),

    // ─── User message routing ─────────────────────────────────────
    on(
      "user.message",
      [[
        branch([{
          if: "$.event.data.payload.mode == 'hermes'",
          steps: [action("Hermes Chat", {
            label: "hermes-chat",
            map: {
              threadId: "$.event.data.payload.threadId",
              text: "$.event.data.payload.text",
              model: "$.event.data.payload.model",
              workspace: "$.event.data.payload.workspace",
            },
          })],
        }], undefined, "Mode Check"),
      ]],
      "Hermes mode \u2192 Hermes Chat",
    ),

    // ─── Stream lifecycle events ──────────────────────────────────
    on(
      "hermes.stream.lifecycle",
      [[
        action("Hermes: Stream Lifecycle", {
          label: "lifecycle",
          map: {
            eventType: "$.event.data.payload.eventType",
            threadId: "$.event.data.payload.threadId",
            streamId: "$.event.data.payload.streamId",
            messageId: "$.event.data.payload.messageId",
            sessionId: "$.event.data.payload.sessionId",
            finalResponse: "$.event.data.payload.finalResponse",
            errorMessage: "$.event.data.payload.errorMessage",
          },
        }),
      ]],
      "Stream lifecycle",
    ),

    // ─── /h-* slash commands ──────────────────────────────────────
    on(
      "user.command",
      [[
        branch([
          { if: "$.event.data.payload.command == 'h-approve'", steps: [action("Hermes Command", { label: "h-approve", map: { command: "$.event.data.payload.command", text: "$.event.data.payload.text", threadId: "$.event.data.payload.threadId" } })] },
          { if: "$.event.data.payload.command == 'h-deny'", steps: [action("Hermes Command", { label: "h-deny", map: { command: "$.event.data.payload.command", text: "$.event.data.payload.text", threadId: "$.event.data.payload.threadId" } })] },
          { if: "$.event.data.payload.command == 'h-compact'", steps: [action("Hermes Command", { label: "h-compact", map: { command: "$.event.data.payload.command", text: "$.event.data.payload.text", threadId: "$.event.data.payload.threadId" } })] },
          { if: "$.event.data.payload.command == 'h-undo'", steps: [action("Hermes Command", { label: "h-undo", map: { command: "$.event.data.payload.command", text: "$.event.data.payload.text", threadId: "$.event.data.payload.threadId" } })] },
          { if: "$.event.data.payload.command == 'h-retry'", steps: [action("Hermes Command", { label: "h-retry", map: { command: "$.event.data.payload.command", text: "$.event.data.payload.text", threadId: "$.event.data.payload.threadId" } })] },
          { if: "$.event.data.payload.command == 'h-model'", steps: [action("Hermes Command", { label: "h-model", map: { command: "$.event.data.payload.command", text: "$.event.data.payload.text", threadId: "$.event.data.payload.threadId" } })] },
          { if: "$.event.data.payload.command == 'h-tools'", steps: [action("Hermes Command", { label: "h-tools", map: { command: "$.event.data.payload.command", text: "$.event.data.payload.text", threadId: "$.event.data.payload.threadId" } })] },
          { if: "$.event.data.payload.command == 'h-memory'", steps: [action("Hermes Command", { label: "h-memory", map: { command: "$.event.data.payload.command", text: "$.event.data.payload.text", threadId: "$.event.data.payload.threadId" } })] },
          { if: "$.event.data.payload.command == 'h-persona'", steps: [action("Hermes Command", { label: "h-persona", map: { command: "$.event.data.payload.command", text: "$.event.data.payload.text", threadId: "$.event.data.payload.threadId" } })] },
          { if: "$.event.data.payload.command == 'h-skills'", steps: [action("Hermes Command", { label: "h-skills", map: { command: "$.event.data.payload.command", text: "$.event.data.payload.text", threadId: "$.event.data.payload.threadId" } })] },
          { if: "$.event.data.payload.command == 'h-status'", steps: [action("Hermes Command", { label: "h-status", map: { command: "$.event.data.payload.command", text: "$.event.data.payload.text", threadId: "$.event.data.payload.threadId" } })] },
        ], undefined, "Command Router"),
      ]],
      "Hermes commands",
    ),
  ],
} satisfies FlowDSL;
