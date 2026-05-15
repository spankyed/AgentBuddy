import type { FlowDSL } from '../types';
import { entry, on, keepAlive, action, branch } from './_patterns';

/**
 * Hermes Agent flow.
 *
 * Routes user messages in hermes mode to the chat action, and stream
 * lifecycle events (started/done/error) to a unified lifecycle handler.
 */
export default {
  "Hermes Agent": [
    entry([keepAlive()]),

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
        }]),
      ]],
      "Hermes mode \u2192 Hermes Chat",
    ),

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
  ],
} satisfies FlowDSL;
