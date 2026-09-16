import type { FlowDSL } from '@abuddy/sdk/build';
import { action, branch, fire, schedule } from '#generated/flow-helpers';

/** Adds a weekly review memo: default-setup's schedule trigger, action and switch steps, through its flow helpers */
export default {
  'Memo Reminder Flow': [
    schedule('0 9 * * 1', [[
      action('Memo: Add', { label: 'add-reminder', params: { text: 'Weekly review' } }),
      branch(
        [{ if: 'success == true', steps: [fire('memo.reminded', { label: 'reminded', scope: 'global' })] }],
        [fire('memo.reminder-failed', { label: 'reminder-failed' })],
        'Added?',
      ),
    ]], 'Weekly'),
  ],
} satisfies FlowDSL;
