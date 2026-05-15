import type { FlowDSL } from '../types';
import { entry, on, keepAlive, action, branch } from './_patterns';

/**
 * Hermes Agent flow.
 *
 * Listens for `user.message` events and routes to the Hermes Chat action
 * only when the user is in `hermes` mode. Any other mode flows past
 * untouched.
 *
 * Mirrors the Claude Code flow structure.
 */
export default {
  "Hermes Agent": [
    entry(
      [keepAlive()],
    ),
    on(
      "user.message",
      [[
        branch([
          {
            if: "$.event.data.payload.mode == 'hermes'",
            steps: [
              action("Hermes Chat", {
                label: "hermes-chat",
                map: {
                  threadId: "$.event.data.payload.threadId",
                  text: "$.event.data.payload.text",
                  mode: "$.event.data.payload.mode",
                  model: "$.event.data.payload.model",
                  workspace: "$.event.data.payload.workspace",
                },
              }),
            ],
          },
        ]),
      ]],
      "Hermes mode \u2192 Hermes Chat",
    ),
  ],
} satisfies FlowDSL;
