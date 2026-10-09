import type { FlowDSL } from '@abuddy/sdk/build';
import { entry, keepAlive } from '#generated/flow-helpers.ts';

export default {
  "__LABEL__": [
    entry([keepAlive()]),
  ],
} satisfies FlowDSL;
