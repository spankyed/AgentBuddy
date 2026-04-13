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
                },
              }),
            ],
          },
        ]),
      ]],
      "Work mode → Claude Code",
    ),
  ],
} satisfies FlowDSL;
