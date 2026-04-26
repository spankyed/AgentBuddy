/**
 * CX: Route Response — classify an interactive block response.
 */

import type { ActionMeta, Services } from '../../types';
import { getCodexState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CX: Route Response',
  description: 'Route an interactive block response for the Codex flow.',
  category: 'codex',
  input: {
    messageId: { type: 'string', description: 'Response message ID', required: true },
    threadId: { type: 'string', description: 'Target thread', required: true },
    response: { type: 'object', description: 'User response payload', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, response } = params;
  const state = getCodexState(services, threadId);

  if (!state?.pendingToolCall) {
    return { denied: false, threadId, response, noOp: true };
  }

  // Check if the response is a denial
  const isDenied = response?.action === 'deny' || response?.denied === true || response?.approved === false;

  return {
    denied: isDenied,
    threadId,
    response,
    toolCallId: state.pendingToolCall.toolCallId,
    toolName: state.pendingToolCall.toolName,
  };
}
