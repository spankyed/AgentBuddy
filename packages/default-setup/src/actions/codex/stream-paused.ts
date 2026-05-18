/** CDX: Stream Paused — updates chat state when an approval request arrives. */

import type { ActionMeta, Services, EntityId } from '../../types';
import { updateChatState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CDX: Stream Paused',
  description: 'Updates chat state to paused when Codex requests approval.',
  category: 'codex',
  input: { threadId: { type: 'string', required: true } },
};

export async function action(params: Record<string, any>, services: Services) {
  const { threadId } = params as { threadId: string };
  if (!threadId) return { success: false, reason: 'missing threadId' };

  updateChatState(services, threadId as EntityId, 'paused');
  return { success: true };
}
