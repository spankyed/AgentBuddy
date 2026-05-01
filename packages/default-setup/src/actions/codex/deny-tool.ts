/**
 * CX: Deny Tool — handle user denial of a tool call.
 *
 * Adds an error result to history and resumes the loop so the LLM can adapt.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { createStreamWriter } from '../claude-code/_helpers/stream-writer';
import { createToolActivityWriter } from '../claude-code/_helpers/tool-activity-writer';
import {
  getCodexState,
  persistCodexState,
  setRunning,
  updateChatState,
} from './_helpers/thread-context';
import { consumeStream } from './_helpers/stream-consumer';

export const meta: ActionMeta = {
  label: 'CX: Deny Tool',
  description: 'Handle user denial of a Codex tool call.',
  category: 'codex',
  input: {
    threadId: { type: 'string', description: 'Target thread', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId } = params;
  const log = services.logger;
  const state = getCodexState(services, threadId);

  if (!state?.pendingToolCall) {
    return { success: false, error: 'No pending tool call' };
  }

  // Guard against stale denial — same logic as approve-tool.
  if (params.messageId && state.pendingToolCall.approvalMessageId !== params.messageId) {
    return { success: false, error: 'Stale denial — turn was superseded' };
  }

  const { toolCallId } = state.pendingToolCall;
  const history = state.conversationHistory || [];

  // Add denial as tool result
  history.push({
    role: 'tool',
    content: 'User denied this operation.',
    tool_call_id: toolCallId,
  } as any);

  persistCodexState(services, threadId, {
    conversationHistory: history,
    pendingToolCall: undefined,
  });
  setRunning(services, threadId, true);
  updateChatState(services, threadId, 'working');

  // Resume loop
  const msg = services.chat.sendBlockMessage({
    threadId, text: 'Thinking…', blocks: [], forkable: false,
  });

  const writer = createStreamWriter(services, msg.messageId as EntityId, { intervalMs: 80 });
  const toolActivity = createToolActivityWriter(services, msg.messageId as EntityId, { intervalMs: 250 });

  consumeStream(
    { services, threadId, text: '', phase: undefined },
    { writer, toolActivity, messageId: msg.messageId as EntityId },
  ).catch((err) => {
    log.error('consumeStream error on deny resume', { err: err?.message });
    setRunning(services, threadId, false);
    updateChatState(services, threadId, 'idle');
  });

  return { success: true };
}
