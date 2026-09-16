/** Memo: Add — stores a memo, for the memo flow. */

import type { ActionMeta } from '@abuddy/sdk/build';
import type { Services } from '#generated/services';

export const meta: ActionMeta = {
  label: 'Memo: Add',
  description: 'Stores a memo with the given text.',
  category: 'memos',
  input: {
    text: { type: 'string', description: 'Memo text', required: true },
  },
};

export async function action(params: Record<string, any>, services: Services) {
  const memo = services.repository.memoCommands.add(String(params.text));
  return { success: true, memoId: memo.id };
}
