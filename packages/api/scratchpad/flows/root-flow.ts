import type { FlowDSL } from '../types';

export default {
  "Root Flow": {
    root: true,
    tracks: [
      {
        event: "flow.entry",
        label: "Flow Entry",
        steps: [
          {
            type: "switch",
            label: "choose path",
            conditions: [
              {
                if: "$.date.dayOfWeek == 'monday'",
                steps: [
                  { type: "action", action: "hungry_tell_girlfriend", label: "do action" },
                ],
              },
            ],
            else: [
              { type: "action", action: "tell_girlfriend_love_you", label: "do action" },
            ],
          },
        ],
      },
    ],
  },
} satisfies FlowDSL;
