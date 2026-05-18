/**
 * CDX: Route Response — classifies an interactive block response and
 * returns flags for the flow's branch node.
 *
 * Currently only handles directory-select responses. Phase 2 will add
 * approval routing.
 */

import type { ActionMeta, Services } from '../../types';
import { getCodexState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CDX: Route Response',
  description: 'Routes interactive block responses to the appropriate Codex handler.',
  category: 'codex',
  input: {
    messageId: { type: 'string', description: 'Interactive message ID', required: true },
    threadId: { type: 'string', description: 'Thread ID', required: true },
    response: { type: 'any', description: 'User response payload', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, response } = params as {
    messageId: string;
    threadId: string;
    response: any;
  };

  if (!threadId) return { success: false, reason: 'missing threadId' };

  const state = getCodexState(services, threadId);
  if (!state) return { success: false, reason: 'no codex state' };

  // Directory picker response
  if (state.pendingDirectorySelect) {
    return {
      success: true,
      threadId,
      response,
      directorySelect: true,
      pendingDirectorySelect: state.pendingDirectorySelect,
    };
  }

  return { success: true, threadId, response, noop: true };
}
