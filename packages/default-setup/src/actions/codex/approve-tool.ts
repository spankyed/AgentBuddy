/** CDX: Approve Tool — sends an approval decision back to the app-server. */

import type { ActionMeta, Services, EntityId } from '../../types';
import { persistCodexState, getCodexState, setRunning } from './_helpers/thread-context';

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

  // Send approval to app-server
  try {
    (services.codex as any).respondToApproval(pending.requestId, decision);
  } catch (err: any) {
    services.logger.warn('[codex] failed to send approval — app-server may have crashed', { error: err?.message });
    return { success: false, reason: 'app-server unavailable' };
  }

  // Mark approval block as responded
  services.chat.updateMessageState(pending.approvalMessageId as EntityId, {
    responseTimestamp: Date.now(),
    blockResponse: { decision },
  } as any);

  // Clear pending state and resume running
  persistCodexState(services, threadId, { pendingApproval: undefined });
  setRunning(services, threadId, true);

  return { success: true, decision };
}
