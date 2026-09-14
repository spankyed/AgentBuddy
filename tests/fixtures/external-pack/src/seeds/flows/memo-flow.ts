import type { FlowDSL } from '@abuddy/sdk/build';
import { on, action } from '#generated/flow-helpers';

/** Stores a memo when something requests one: a flow on default-setup's brain and action step */
export default {
  'Memo Flow': [
    on('memo.requested', [[
      action('Memo: Add', { label: 'add-memo', map: { text: '$.event.data.payload.text' } }),
    ]]),
  ],
} satisfies FlowDSL;
