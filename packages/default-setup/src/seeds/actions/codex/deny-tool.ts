/** CDX: Deny Tool — declines a pending approval request. */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getCodexState, killTurn, updateChatState, persistCodexState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CDX: Deny Tool',
  description: 'Declines a pending Codex approval request.',
  category: 'codex',
  input: {
    threadId: { type: 'string', required: true },
  },
};

export async function action(params: Record<string, any>, services: Services) {
  const { threadId } = params as { threadId: string };
  if (!threadId) return { success: false, reason: 'missing threadId' };

  const state = getCodexState(services, threadId);
  const pending = state?.pendingApproval;
  if (!pending) return { success: false, reason: 'no pending approval' };

  // Mark approval block as responded
  const asideText = `✗ Denied — ${pending.summary || 'tool request'}`;
  services.chat.updateMessageState(pending.approvalMessageId as EntityId, {
    responseTimestamp: Date.now(),
    blockResponse: { approved: false, decision: 'decline' },
    asideText,
  } as any);

  // Plan approval denial — no active turn to kill, just clean up
  if (pending.method === 'plan/approval') {
    persistCodexState(services, threadId, { pendingApproval: undefined });
    updateChatState(services, threadId as EntityId, 'idle');
    return { success: true };
  }

  // Tool approval — send decline to app-server and kill the turn
  try {
    (services.codex as any).respondToApproval(pending.requestId, 'decline');
  } catch (err: any) {
    services.logger.warn('[codex] failed to send decline — app-server may have crashed', { error: err?.message });
  }

  killTurn(services, threadId);
  updateChatState(services, threadId as EntityId, 'idle');

  return { success: true };
}
