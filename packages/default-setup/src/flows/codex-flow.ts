import type { FlowDSL } from '../types';
import { entry, on, keepAlive, action, branch } from './_patterns';

/**
 * Codex work-mode flow.
 *
 * Listens for `user.message` events and routes to the Codex Chat action
 * only when the user is in `codex` mode. Mirrors the Claude Code flow
 * structure with approval routing and stream lifecycle events.
 */
export default {
  "Codex": [
    entry(
      [keepAlive()],
    ),
    on(
      "user.message",
      [[
        branch([
          {
            if: "$.event.data.payload.mode == 'codex'",
            steps: [
              action("Codex Chat", {
                label: "codex-chat",
                map: {
                  threadId: "$.event.data.payload.threadId",
                  text: "$.event.data.payload.text",
                  mode: "$.event.data.payload.mode",
                  phase: "$.event.data.payload.phase",
                  messageId: "$.event.data.payload.messageId",
                  references: "$.event.data.payload.references",
                },
              }),
            ],
          },
        ]),
      ]],
      "Codex mode → Codex Chat",
    ),
    on(
      "interactive.message.response",
      [[
        action("CX: Route Response", {
          label: "route-response",
          map: {
            messageId: "$.event.data.payload.messageId",
            threadId: "$.event.data.payload.threadId",
            response: "$.event.data.payload.response",
          },
        }),
        branch([
          {
            if: "$.lastStep.result.denied == true",
            steps: [
              action("CX: Deny Tool", {
                label: "deny-tool",
                map: {
                  threadId: "$.steps[label=route-response].result.threadId",
                },
              }),
            ],
          },
        ], [
          action("CX: Approve Tool", {
            label: "approve-tool",
            map: {
              threadId: "$.steps[label=route-response].result.threadId",
              response: "$.steps[label=route-response].result.response",
            },
          }),
        ]),
      ]],
      "Permission response",
    ),
    on(
      "cx.stream.started",
      [[
        action("CX: Stream Started", {
          label: "stream-started",
          map: {
            threadId: "$.event.data.payload.threadId",
            model: "$.event.data.payload.model",
            cwd: "$.event.data.payload.cwd",
          },
        }),
      ]],
      "Stream started",
    ),
    on(
      "cx.stream.paused",
      [[
        action("CX: Stream Paused", {
          label: "stream-paused",
          map: {
            threadId: "$.event.data.payload.threadId",
            toolName: "$.event.data.payload.toolName",
          },
        }),
      ]],
      "Permission requested",
    ),
    on(
      "cx.stream.completed",
      [[
        action("CX: Turn Completed", {
          label: "turn-completed",
          map: {
            threadId: "$.event.data.payload.threadId",
            text: "$.event.data.payload.text",
          },
        }),
      ]],
      "Turn completed",
    ),
    on(
      "user.thread.pause",
      [[
        action("CX: Pause Turn", {
          label: "pause-turn",
          map: {
            threadId: "$.event.data.payload.threadId",
          },
        }),
      ]],
      "Pause",
    ),
  ],
} satisfies FlowDSL;
