/** CDX: Refine Plan — clears pending plan approval and starts a new plan turn with user feedback. */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getCodexState, persistCodexState, updateChatState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CDX: Refine Plan',
  description: 'Starts a new plan turn with user feedback to refine the plan.',
  category: 'codex',
  input: {
    threadId: { type: 'string', required: true },
    feedbackText: { type: 'string', required: true },
  },
};

export async function action(params: Record<string, any>, services: Services) {
  const { threadId, feedbackText } = params as { threadId: string; feedbackText: string };
  if (!threadId || !feedbackText?.trim()) return { success: false, reason: 'missing threadId or feedbackText' };

  const state = getCodexState(services, threadId);
  const pending = state?.pendingApproval;

  // Mark old approval block as responded
  if (pending?.approvalMessageId) {
    services.chat.updateMessageState(pending.approvalMessageId as EntityId, {
      responseTimestamp: Date.now(),
      blockResponse: { feedback: feedbackText },
    } as any);
  }

  // Clear pending approval
  persistCodexState(services, threadId, { pendingApproval: undefined });
  updateChatState(services, threadId as EntityId, 'working');

  // Start a new plan turn with feedback — stays in plan mode for refinement
  await services.action.getAndExecute('Codex Chat', {
    threadId,
    text: feedbackText,
    mode: 'Codex',
    phase: 'plan',
  });

  return { success: true };
}
