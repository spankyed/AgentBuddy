/** CDX: Route Response — classifies interactive block responses for the flow's branch node. */

import type { ActionMeta, Services } from '../../types';
import { getCodexState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CDX: Route Response',
  description: 'Routes interactive block responses to the appropriate Codex handler.',
  category: 'codex',
  input: {
    messageId: { type: 'string', required: true },
    threadId: { type: 'string', required: true },
    response: { type: 'any', required: true },
  },
};

export async function action(params: Record<string, any>, services: Services) {
  const { threadId, response } = params as { messageId: string; threadId: string; response: any };
  if (!threadId) return { success: false, reason: 'missing threadId' };

  const state = getCodexState(services, threadId);
  if (!state) return { success: false, reason: 'no codex state' };

  // Directory picker response
  if (state.pendingDirectorySelect) {
    return { success: true, threadId, response, directorySelect: true, pendingDirectorySelect: state.pendingDirectorySelect };
  }

  // Approval response
  if (state.pendingApproval) {
    // Plan feedback — user submitted text input instead of clicking approve/deny
    if (typeof response === 'string' && response.trim()) {
      return {
        success: true, threadId, response,
        planFeedback: true,
        feedbackText: response.trim(),
      };
    }

    const decision = response?.decision
      || response?.flags?.decision
      || (typeof response === 'string' ? response : undefined);
    const denied = decision === 'decline' || decision === 'cancel';

    return {
      success: true,
      threadId,
      response,
      approval: true,
      denied,
      requestId: state.pendingApproval.requestId,
      decision: decision || 'accept',
    };
  }

  return { success: true, threadId, response, noop: true };
}
