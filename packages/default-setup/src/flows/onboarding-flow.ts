import type { FlowDSL } from '../types';
import { entry, on, keepAlive, action } from './_patterns';

export default {
  "Onboarding Flow": [
    entry([
      action("Init Onboarding", { label: "setup onboarding" }),
      keepAlive(),
    ]),
    on("interactive.message.response", [[
      action("Handle Onboarding Response", {
        label: "advance step",
        map: {
          messageId: "$.event.data.payload.messageId",
          threadId: "$.event.data.payload.threadId",
          response: "$.event.data.payload.response",
        },
      }),
    ]], "Route Response"),
    on("user.message", [[
      action("Ignore Onboarding Message", {
        label: "cancel onboarding message",
        map: {
          threadId: "$.event.data.payload.threadId",
          messageId: "$.event.data.payload.messageId",
        },
      }),
    ]], "Ignore Message"),
  ],
} satisfies FlowDSL;
