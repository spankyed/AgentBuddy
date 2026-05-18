import type { FlowDSL } from '../types';
import { entry, on, keepAlive, action, branch } from './_patterns';

/**
 * Codex mode flow.
 *
 * Listens for `user.message` events and routes to the Codex Chat
 * action only when the user is in `codex` mode. Mirrors the Claude Code
 * flow structure with `cdx.*` event prefixes.
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
    // ─── Interactive responses (directory select, Phase 2 approvals) ──
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
        ], undefined, "Response router"),
      ]],
      "Interactive response",
    ),
    // ─── Stream lifecycle ────────────────────────────────────────────
    on(
      "cdx.stream.started",
      [[
        action("CDX: Stream Started", {
          label: "streaming",
          map: {
            threadId: "$.event.data.payload.threadId",
            codexThreadId: "$.event.data.payload.codexThreadId",
          },
        }),
      ]],
      "Stream started",
    ),
    on(
      "cdx.stream.paused",
      [[
        action("CDX: Stream Paused", {
          label: "awaiting-approval",
          map: {
            threadId: "$.event.data.payload.threadId",
          },
        }),
      ]],
      "Approval requested (Phase 2)",
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
