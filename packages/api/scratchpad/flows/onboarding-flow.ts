import type { FlowDSL } from '../types';
import { modeTracks, action } from './_patterns';

export default {
  "Onboarding Flow": modeTracks(
    [action("Init Onboarding", { label: "setup onboarding" })],
    [
      {
        event: "interactive.message.response",
        label: "Route Response",
        steps: [
          action("Handle Onboarding Response", {
            label: "advance step",
            map: {
              messageId: "$.event.data.payload.messageId",
              threadId: "$.event.data.payload.threadId",
              response: "$.event.data.payload.response",
            },
          }),
        ],
      },
      {
        event: "user.message",
        label: "Ignore Message",
        steps: [
          action("Ignore Onboarding Message", {
            label: "send unable message",
            map: {
              threadId: "$.event.data.payload.threadId",
            },
          }),
        ],
      },
    ],
  ),
} satisfies FlowDSL;
