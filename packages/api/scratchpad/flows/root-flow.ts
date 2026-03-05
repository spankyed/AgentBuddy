import type { FlowDSL } from '../types';
import { branch, action } from './_patterns';

export default {
  "Root Flow": {
    root: true,
    tracks: [
      {
        event: "flow.entry",
        label: "Flow Entry",
        steps: [
          action("Analyze Text", { label: "analyze input" }),
          branch(
            [
              {
                if: "$.intent == 'question'",
                steps: [action("db query", { label: "lookup" })],
              },
              {
                if: "$.intent == 'request'",
                steps: [action("Create Birth Thread", { label: "onboard" })],
              },
            ],
            [action("Mock Block Messages", { label: "default response" })],
          ),
        ],
      },
    ],
  },
} satisfies FlowDSL;
