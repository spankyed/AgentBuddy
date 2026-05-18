/** CDX: Handle Revert — roll back Codex app-server history after an app revert. */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getCodexState, killTurn, persistCodexState, updateChatState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CDX: Handle Revert',
  description: 'Rolls back Codex thread history after visible messages are reverted.',
  category: 'codex',
  input: {
    threadId: { type: 'string', required: true },
    messageId: { type: 'string', required: true },
    deletedUserMessageCount: { type: 'number', required: false },
  },
};

export async function action(params: Record<string, any>, services: Services) {
  const { threadId, deletedUserMessageCount } = params as {
    threadId: string;
    messageId?: string;
    deletedUserMessageCount?: number;
  };
  if (!threadId) return { success: false, reason: 'missing threadId' };

  const state = getCodexState(services, threadId);
  killTurn(services, threadId);

  const codexThreadId = state?.threadId;
  const numTurns = Math.max(0, Number(deletedUserMessageCount ?? 0));
  if (!codexThreadId || numTurns < 1) {
    updateChatState(services, threadId as EntityId, 'idle');
    return { success: true, rolledBack: false, reason: !codexThreadId ? 'no codex thread' : 'no turns to roll back' };
  }

  try {
    const result = await (services.codex as any).rollbackThread({ threadId: codexThreadId, numTurns });
    persistCodexState(services, threadId, {
      threadId: result.thread?.id ?? codexThreadId,
      turnId: undefined,
      activeMessageId: undefined,
      pendingApproval: undefined,
      isRunning: false,
    });
    updateChatState(services, threadId as EntityId, 'idle');
    return { success: true, rolledBack: true, numTurns };
  } catch (error: any) {
    services.logger.warn('[codex] rollback failed', { threadId, codexThreadId, numTurns, error: error?.message });
    updateChatState(services, threadId as EntityId, 'error');
    services.chat.sendBlockMessage({
      threadId: threadId as EntityId,
      text: `⚠️ Codex rollback failed — ${error?.message || 'unknown error'}.`,
      blocks: [],
      forkable: false,
    });
    return { success: false, error: error?.message, numTurns };
  }
}
