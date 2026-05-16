import type { FlowDSL } from '../types';
import { entry, on, keepAlive, action, branch } from './_patterns';

export default {
  "Onboarding Flow": [
    entry([
      action("Init Onboarding", { label: "setup onboarding" }),
      keepAlive(),
    ]),
    on("interactive.message.response", [[
      action("Handle Onboarding Response", {
        label: "route-response",
        map: {
          messageId: "$.event.data.payload.messageId",
          threadId: "$.event.data.payload.threadId",
          response: "$.event.data.payload.response",
        },
      }),
      branch([
        {
          if: "$.lastStep.result.step == 'welcome'",
          steps: [
            action("Handle Welcome Step", {
              label: "welcome",
              map: {
                threadId: "$.steps[label=route-response].result.threadId",
                response: "$.steps[label=route-response].result.response",
              },
            }),
          ],
        },
        {
          if: "$.lastStep.result.step == 'cli-test-ask'",
          steps: [
            action("Handle CLI Test Step", {
              label: "cli-test",
              map: {
                threadId: "$.steps[label=route-response].result.threadId",
                response: "$.steps[label=route-response].result.response",
              },
            }),
          ],
        },
        {
          if: "$.lastStep.result.step == 'projects'",
          steps: [
            action("Handle Projects Step", {
              label: "projects",
              map: {
                threadId: "$.steps[label=route-response].result.threadId",
                response: "$.steps[label=route-response].result.response",
              },
            }),
          ],
        },
        {
          if: "$.lastStep.result.step == 'import-threads'",
          steps: [
            action("Handle CC Import Threads Step", {
              label: "import-threads",
              map: {
                threadId: "$.steps[label=route-response].result.threadId",
                response: "$.steps[label=route-response].result.response",
              },
            }),
          ],
        },
        {
          if: "$.lastStep.result.step == 'pick-thread'",
          steps: [
            action("Handle Pick Thread Step", {
              label: "pick-thread",
              map: {
                threadId: "$.steps[label=route-response].result.threadId",
                response: "$.steps[label=route-response].result.response",
              },
            }),
          ],
        },
        {
          if: "$.lastStep.result.step == 'hermes-setup'",
          steps: [
            action("Handle Hermes Setup Step", {
              label: "hermes-setup",
              map: {
                threadId: "$.steps[label=route-response].result.threadId",
                response: "$.steps[label=route-response].result.response",
              },
            }),
          ],
        },
      ]),
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
