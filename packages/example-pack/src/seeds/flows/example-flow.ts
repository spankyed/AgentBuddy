import type { FlowDSL } from '../../types';

export default {
  'example-flow': {
    tracks: [
      {
        event: 'user.command',
        exits: [
          [
            {
              type: 'action',
              action: 'Hello World',
              params: { name: 'ExamplePack' },
            },
          ],
        ],
      },
    ],
  },
} satisfies FlowDSL;
