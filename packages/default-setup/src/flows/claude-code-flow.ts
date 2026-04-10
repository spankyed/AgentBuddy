import type { FlowDSL } from '../types';
import { action, branch } from './_patterns';

/**
 * Claude Code work-mode flow.
 *
 * Listens for `user.message` events and, when the user is in the `work`
 * mode (see `plugins.threads.chat.modes` in settings defaults), forwards
 * the message to the `Claude Code Chat` action. Messages sent in any
 * other mode (`chat`, `note`, `birth`, …) flow past this track untouched
 * — other flows that listen on `user.message` keep firing in parallel.
 *
 * The `phase` sub-value (`plan` / `edit` / `review`) is passed through
 * so the chat action can prefix a phase-aware system prompt hint.
 */
export default {
  "Claude Code": [
    {
      event: "user.message",
      label: "Work mode → Claude Code",
      exits: [[
        branch([
          {
            if: "$.event.data.payload.mode === 'work'",
            steps: [
              action("Claude Code Chat", {
                label: "chat",
                map: {
                  threadId: "$.event.data.payload.threadId",
                  text: "$.event.data.payload.text",
                  mode: "$.event.data.payload.mode",
                  phase: "$.event.data.payload.phase",
                },
              }),
            ],
          },
        ]),
      ]],
    },
  ],
} satisfies FlowDSL;
