/** CDX: Approve Tool — sends an approval decision back to the app-server, or starts an execute turn after plan approval. */

import type { ActionMeta, Services, EntityId } from '../../types';
import { persistCodexState, getCodexState, setRunning, updateChatState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CDX: Approve Tool',
  description: 'Sends approval decision to the Codex app-server for a pending tool request.',
  category: 'codex',
  input: {
    threadId: { type: 'string', required: true },
    requestId: { type: 'number', required: true },
    decision: { type: 'string', required: false },
    response: { type: 'any', required: false },
  },
};

export async function action(params: Record<string, any>, services: Services) {
  const { threadId, response } = params as {
    threadId: string; requestId?: number; decision?: string; response?: any;
  };

  if (!threadId) return { success: false, reason: 'missing threadId' };

  const state = getCodexState(services, threadId);
  const pending = state?.pendingApproval;
  if (!pending) return { success: false, reason: 'no pending approval' };

  // Extract decision from response flags or params
  const decision = params.decision
    || response?.decision
    || (response?.flags?.decision)
    || 'accept';

  // Mark approval block as responded
  services.chat.updateMessageState(pending.approvalMessageId as EntityId, {
    responseTimestamp: Date.now(),
    blockResponse: { decision },
  } as any);

  // Plan approval — start a new execute turn instead of responding to app-server
  if (pending.method === 'plan/approval') {
    persistCodexState(services, threadId, { pendingApproval: undefined });

    if (decision === 'accept' || decision === 'acceptForSession') {
      // Start a new turn in execute mode — the plan context is already in the thread
      updateChatState(services, threadId as EntityId, 'working');
      services.action.executeAction('Codex Chat', {
        threadId,
        text: 'Approved. Implement the plan now.',
        mode: 'Codex',
        // phase undefined → no collaborationMode → default execution mode
      });
    } else {
      updateChatState(services, threadId as EntityId, 'idle');
    }
    return { success: true, decision, planApproval: true };
  }

  // Tool approval — respond to the app-server's approval request
  try {
    (services.codex as any).respondToApproval(pending.requestId, decision);
  } catch (err: any) {
    services.logger.warn('[codex] failed to send approval — app-server may have crashed', { error: err?.message });
    return { success: false, reason: 'app-server unavailable' };
  }

  // Clear pending state and resume running
  persistCodexState(services, threadId, { pendingApproval: undefined });
  setRunning(services, threadId, true);

  return { success: true, decision };
}
