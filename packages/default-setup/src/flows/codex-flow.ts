import type { FlowDSL } from '../types';
import { entry, on, keepAlive, action, branch } from './_patterns';

/**
 * Codex mode flow.
 *
 * Spawns the app-server on flow entry, then listens for user messages
 * in codex mode, interactive responses (directory select + approvals),
 * stream lifecycle events, and user controls (pause/unqueue).
 */
export default {
  "Codex": [
    entry(
      [action("CDX: Start Server", { label: "start-server" })],
      [keepAlive()],
    ),
    on(
      "user.message",
      [[
        branch([
          {
            if: "$.event.data.payload.mode == 'Codex'",
            steps: [
              action("Codex Chat", {
                label: "codex-chat",
                map: {
                  threadId: "$.event.data.payload.threadId",
                  text: "$.event.data.payload.text",
                  mode: "$.event.data.payload.mode",
                  phase: "$.event.data.payload.phase",
                  model: "$.event.data.payload.model",
                  messageId: "$.event.data.payload.messageId",
                  references: "$.event.data.payload.references",
                  cwdOverride: "$.event.data.payload.cwdOverride",
                  forceDirectoryPicker: "$.event.data.payload.forceDirectoryPicker",
                },
              }),
            ],
          },
        ]),
      ]],
      "Codex mode → Codex Chat",
    ),
    // ─── Interactive responses (directory select + approvals) ──────────
    on(
      "interactive.message.response",
      [[
        action("CDX: Route Response", {
          label: "route-response",
          map: {
            messageId: "$.event.data.payload.messageId",
            threadId: "$.event.data.payload.threadId",
            response: "$.event.data.payload.response",
          },
        }),
        branch([
          {
            if: "$.lastStep.result.directorySelect == true",
            steps: [
              action("CDX: Handle Directory Select", {
                label: "directory-select",
                map: {
                  threadId: "$.steps[label=route-response].result.threadId",
                  response: "$.steps[label=route-response].result.response",
                  pendingDirectorySelect: "$.steps[label=route-response].result.pendingDirectorySelect",
                },
              }),
            ],
          },
          {
            if: "$.lastStep.result.denied == true",
            steps: [
              action("CDX: Deny Tool", {
                label: "deny-tool",
                map: {
                  threadId: "$.steps[label=route-response].result.threadId",
                },
              }),
            ],
          },
          {
            if: "$.lastStep.result.approval == true",
            steps: [
              action("CDX: Approve Tool", {
                label: "approve-tool",
                map: {
                  threadId: "$.steps[label=route-response].result.threadId",
                  requestId: "$.steps[label=route-response].result.requestId",
                  decision: "$.steps[label=route-response].result.decision",
                  response: "$.steps[label=route-response].result.response",
                },
              }),
            ],
          },
        ], undefined, "Response router"),
      ]],
      "Interactive response",
    ),
    // ─── Stream lifecycle ────────────────────────────────────────────
    on(
      "cdx.stream.paused",
      [[
        action("CDX: Stream Paused", {
          label: "stream-paused",
          map: {
            threadId: "$.event.data.payload.threadId",
          },
        }),
      ]],
      "Approval requested",
    ),
    on(
      "cdx.stream.completed",
      [[
        action("CDX: Turn Completed", {
          label: "turn-done",
          map: {
            threadId: "$.event.data.payload.threadId",
            usage: "$.event.data.payload.usage",
            toolCallCount: "$.event.data.payload.toolCallCount",
            mutatedPaths: "$.event.data.payload.mutatedPaths",
            hadErrors: "$.event.data.payload.hadErrors",
          },
        }),
      ]],
      "Turn completed",
    ),
    // ─── User controls ──────────────────────────────────────────────
    on(
      "user.thread.pause",
      [[
        branch([
          {
            if: "$.event.data.payload.mode == 'codex'",
            steps: [
              action("CDX: Pause Turn", {
                label: "pause",
                map: {
                  threadId: "$.event.data.payload.threadId",
                },
              }),
            ],
          },
        ], undefined, "Pause gate"),
      ]],
      "Pause turn",
    ),
    on(
      "user.thread.unqueue",
      [[
        branch([
          {
            if: "$.event.data.payload.mode == 'codex'",
            steps: [
              action("CDX: Unqueue Message", {
                label: "unqueue",
                map: {
                  threadId: "$.event.data.payload.threadId",
                  messageId: "$.event.data.payload.messageId",
                },
              }),
            ],
          },
        ], undefined, "Unqueue gate"),
      ]],
      "Unqueue message",
    ),
  ],
} satisfies FlowDSL;
