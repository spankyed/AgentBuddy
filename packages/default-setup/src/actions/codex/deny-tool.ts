/** CDX: Deny Tool — declines a pending approval request. */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getCodexState, killTurn, updateChatState } from './_helpers/thread-context';

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

  // Send decline to app-server
  try {
    (services.codex as any).respondToApproval(pending.requestId, 'decline');
  } catch (err: any) {
    services.logger.warn('[codex] failed to send decline — app-server may have crashed', { error: err?.message });
  }

  // Mark approval block as responded
  services.chat.updateMessageState(pending.approvalMessageId as EntityId, {
    responseTimestamp: Date.now(),
    blockResponse: { decision: 'decline' },
  } as any);

  // Kill the turn
  killTurn(services, threadId);
  updateChatState(services, threadId as EntityId, 'idle');

  return { success: true };
}
