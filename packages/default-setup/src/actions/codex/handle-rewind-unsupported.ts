/** CDX: Handle Rewind Unsupported — Codex rollback cannot restore local files. */

import type { ActionMeta, Services, EntityId } from '../../types';

export const meta: ActionMeta = {
  label: 'CDX: Handle Rewind Unsupported',
  description: 'Performs Codex conversation rollback and explains that file rewind is unsupported.',
  category: 'codex',
  input: {
    threadId: { type: 'string', required: true },
    messageId: { type: 'string', required: true },
    deletedUserMessageCount: { type: 'number', required: false },
  },
};

export async function action(params: Record<string, any>, services: Services) {
  const { threadId, messageId, deletedUserMessageCount } = params as {
    threadId: string;
    messageId?: string;
    deletedUserMessageCount?: number;
  };
  if (!threadId) return { success: false, reason: 'missing threadId' };

  const revert = await services.action.getAndExecute('CDX: Handle Revert', {
    threadId,
    messageId,
    deletedUserMessageCount,
  });

  services.chat.sendBlockMessage({
    threadId: threadId as EntityId,
    text: 'Codex reverted the conversation, but file rewind is not available for Codex threads yet. Codex app-server rollback only changes conversation history and does not restore local file changes.',
    blocks: [],
    forkable: false,
  });

  return { success: true, revert };
}
