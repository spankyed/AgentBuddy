import type { FlowDSL } from '@abuddy/sdk/build';
import { entry, keepAlive, on, action } from '#generated/flow-helpers';

/** Stores a memo when something requests one: a long-running flow on default-setup's brain and action step */
export default {
  'Memo Flow': [
    entry([keepAlive()]),
    on('memo.requested', [[
      action('Memo: Add', { label: 'add-memo', map: { text: '$.event.data.payload.text' } }),
    ]]),
  ],
} satisfies FlowDSL;
