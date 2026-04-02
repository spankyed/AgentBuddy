/**
 * Example flow — this file is excluded from compilation (.example.ts).
 * Use as a reference when writing new flows.
 */
import type { FlowDSL } from '../types';

export default {
  'Example Flow': [
    {
      event: 'USER_MESSAGE',
      label: 'On User Message',
      exits: [
        [
          {
            type: 'action',
            action: 'Example Action',
            label: 'Run Example',
          },
          {
            type: 'fire',
            event: 'EXAMPLE_DONE',
            scope: 'local',
          },
        ],
      ],
    },
  ],
} satisfies FlowDSL;
