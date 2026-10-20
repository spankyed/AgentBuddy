import type { FlowDSL } from '@apackdev/sdk/build';
import { entry, keepAlive, on, stamp } from '#generated/flow-helpers.ts';

export default {
  'Stamp Flow': [
    entry([keepAlive()]),
    on('stamp.requested', [[stamp('step-owner service reached')]]),
  ],
} satisfies FlowDSL;
