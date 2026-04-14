import type { FlowDSL } from '../types';
import { entry, on, keepAlive, action, branch } from './_patterns';

/**
 * Claude Code work-mode flow.
 *
 * Listens for `user.message` events and routes to the Claude Code Chat
 * action only when the user is in `work` mode. Any other mode (`chat`,
 * `note`, `birth`, …) flows past this track untouched — the switch node
 * emits a `noMatch` completion and the chain ends without firing any
 * action. See `packages/api/src/systems/brain/node-handlers/switch-node.ts`
 * for the runtime semantics of "no condition matched, no else".
 *
 * The `phase` sub-value (`plan` / `edit` / `review`) is passed through so
 * the chat action can prefix a phase-aware system prompt hint.
 */
export default {
  "Claude Code": [
    entry(
      [keepAlive()],
    ),
    on(
      "user.message",
      [[
        branch([
          {
            if: "$.event.data.payload.mode == 'work'",
            steps: [
              action("Claude Code Chat", {
                label: "work",
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
      "Work mode → Claude Code",
    ),
    // Route interactive block responses (approval, choice, question) back
    // to the CLI. The router classifies the response, then the switch
    // branches to the appropriate handler.
    on(
      "interactive.message.response",
      [[
        action("CC: Route Response", {
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
              action("CC: Handle Directory Select", {
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
              action("CC: Deny Turn", {
                label: "deny-turn",
                map: {
                  threadId: "$.steps[label=route-response].result.threadId",
                  toolName: "$.steps[label=route-response].result.toolName",
                },
              }),
            ],
          },
          {
            if: "$.lastStep.result.toolName == 'AskUserQuestion'",
            steps: [
              action("CC: Answer Question", {
                label: "answer-question",
                map: {
                  threadId: "$.steps[label=route-response].result.threadId",
                  requestId: "$.steps[label=route-response].result.requestId",
                  originalInput: "$.steps[label=route-response].result.originalInput",
                  response: "$.steps[label=route-response].result.response",
                },
              }),
            ],
          },
        ], [
          // else: tool approval (Write, Edit, Bash, ExitPlanMode, etc.)
          action("CC: Resume Turn", {
            label: "resume-turn",
            map: {
              threadId: "$.steps[label=route-response].result.threadId",
              requestId: "$.steps[label=route-response].result.requestId",
              toolName: "$.steps[label=route-response].result.toolName",
              originalInput: "$.steps[label=route-response].result.originalInput",
            },
          }),
        ]),
      ]],
      "Permission response",
    ),
    // ─── Stream lifecycle ────────────────────────────────────────────
    // The stream consumer emits cc.stream.* brain events at lifecycle
    // boundaries. These listeners do real work: session artifact updates,
    // diff artifact creation, and queued message drain.
    on(
      "cc.stream.started",
      [[
        action("CC: Stream Started", {
          label: "streaming",
          map: {
            threadId: "$.event.data.payload.threadId",
            sessionId: "$.event.data.payload.sessionId",
            model: "$.event.data.payload.model",
            cwd: "$.event.data.payload.cwd",
          },
        }),
      ]],
      "Stream started",
    ),
    on(
      "cc.stream.paused",
      [[
        action("CC: Stream Paused", {
          label: "awaiting-permission",
          map: {
            threadId: "$.event.data.payload.threadId",
            toolName: "$.event.data.payload.toolName",
          },
        }),
      ]],
      "Permission requested",
    ),
    on(
      "cc.stream.completed",
      [[
        action("CC: Turn Completed", {
          label: "turn-done",
          map: {
            threadId: "$.event.data.payload.threadId",
            sessionId: "$.event.data.payload.sessionId",
            costUsd: "$.event.data.payload.costUsd",
            durationMs: "$.event.data.payload.durationMs",
            toolCallCount: "$.event.data.payload.toolCallCount",
            mutatedFileCount: "$.event.data.payload.mutatedFileCount",
            mutatedPaths: "$.event.data.payload.mutatedPaths",
            hadErrors: "$.event.data.payload.hadErrors",
            error: "$.event.data.payload.error",
            userText: "$.event.data.payload.userText",
          },
        }),
      ]],
      "Turn completed",
    ),
    // ─── Thread lifecycle ────────────────────────────────────────────
    // Clean up Claude Code state when threads are reverted or forked.
    on(
      "thread.revert",
      [[
        action("CC: Handle Revert", {
          label: "revert",
          map: {
            threadId: "$.event.data.payload.threadId",
            messageId: "$.event.data.payload.messageId",
            restoreFiles: "$.event.data.payload.restoreFiles",
            userCliUuid: "$.event.data.payload.userCliUuid",
          },
        }),
      ]],
      "Thread reverted",
    ),
    on(
      "thread.fork",
      [[
        action("CC: Handle Fork", {
          label: "fork",
          map: {
            sourceThreadId: "$.event.data.payload.sourceThreadId",
            sourceMessageId: "$.event.data.payload.sourceMessageId",
            newThreadId: "$.event.data.payload.newThreadId",
          },
        }),
      ]],
      "Thread forked",
    ),
  ],
} satisfies FlowDSL;
