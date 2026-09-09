import type { FlowDSL } from '@abuddy/sdk/build';

export default {
  'example-flow': [
    {
      event: 'user.command',
      exits: [
        [
          {
            type: 'action',
            action: 'Hello World',
            params: { name: 'ExamplePack' },
          },
          {
            type: 'delay',
            duration: 5,
            label: 'Wait before next step',
          },
        ],
      ],
    },
  ],
} satisfies FlowDSL;
