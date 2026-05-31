/** CDX: Handle Fork — create an app-server fork for a newly forked app thread. */

import type { ActionMeta, Services, EntityId } from '../../types';
import { ensureSessionMarker, getCodexState, persistCodexState, updateChatState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CDX: Handle Fork',
  description: 'Copies Codex thread state to an AgentBuddy fork using Codex app-server thread/fork.',
  category: 'codex',
  input: {
    sourceThreadId: { type: 'string', required: true },
    sourceMessageId: { type: 'string', required: false },
    newThreadId: { type: 'string', required: true },
    sourceUserMessagesAfterFork: { type: 'number', required: false },
  },
};

export async function action(params: Record<string, any>, services: Services) {
  const { sourceThreadId, newThreadId, sourceUserMessagesAfterFork } = params as {
    sourceThreadId: string;
    sourceMessageId?: string;
    newThreadId: string;
    sourceUserMessagesAfterFork?: number;
  };
  if (!sourceThreadId || !newThreadId) return { success: false, reason: 'missing sourceThreadId or newThreadId' };

  const sourceState = getCodexState(services, sourceThreadId);
  if (!sourceState?.threadId) {
    return { success: true, copied: false, reason: 'no codex thread' };
  }

  try {
    const fork = await (services.codex as any).forkThread({
      threadId: sourceState.threadId,
      cwd: sourceState.cwd,
      model: sourceState.model,
      sandbox: sourceState.sandbox ?? 'workspace-write',
      approvalsReviewer: sourceState.approvalMode ?? 'user',
    });
    const forkedCodexThreadId = fork.threadId;
    const rollbackTurns = Math.max(0, Number(sourceUserMessagesAfterFork ?? 0));

    if (forkedCodexThreadId && rollbackTurns > 0) {
      await (services.codex as any).rollbackThread({ threadId: forkedCodexThreadId, numTurns: rollbackTurns });
    }

    ensureSessionMarker(services, newThreadId as EntityId);
    persistCodexState(services, newThreadId, {
      threadId: forkedCodexThreadId,
      cwd: fork.cwd || sourceState.cwd,
      model: fork.model || sourceState.model,
      approvalMode: sourceState.approvalMode ?? 'user',
      sandbox: sourceState.sandbox ?? 'workspace-write',
      startedAt: Date.now(),
      lastTurnAt: sourceState.lastTurnAt,
      turns: sourceState.turns,
      totalTokens: sourceState.totalTokens,
      chatState: 'idle',
      isRunning: false,
      pendingApproval: undefined,
      queuedMessage: undefined,
      turnId: undefined,
      activeMessageId: undefined,
    });
    updateChatState(services, newThreadId as EntityId, 'idle');

    return { success: true, copied: true, codexThreadId: forkedCodexThreadId, rollbackTurns };
  } catch (error: any) {
    services.logger.warn('[codex] fork failed', { sourceThreadId, newThreadId, error: error?.message });
    services.chat.sendBlockMessage({
      threadId: newThreadId as EntityId,
      text: `⚠️ Codex fork setup failed — ${error?.message || 'unknown error'}. The visible thread was forked, but the next Codex message may start fresh.`,
      blocks: [],
      forkable: false,
    });
    return { success: false, error: error?.message };
  }
}
