/**
 * CX: Approve Tool — handle user approval of a tool call.
 *
 * Executes the pending tool, adds the result to conversation history,
 * and resumes the agentic loop.
 */

import type { ActionMeta, Services, Z, EntityId } from '../../types';
import { createStreamWriter } from '../claude-code/_helpers/stream-writer';
import { createToolActivityWriter } from '../claude-code/_helpers/tool-activity-writer';
import {
  getCodexState,
  persistCodexState,
  setRunning,
  updateChatState,
} from './_helpers/thread-context';
import { executeToolCall } from './_helpers/tool-executor';
import { consumeStream } from './_helpers/stream-consumer';

export const meta: ActionMeta = {
  label: 'CX: Approve Tool',
  description: 'Execute an approved tool call and resume the Codex agentic loop.',
  category: 'codex',
  input: {
    threadId: { type: 'string', description: 'Target thread', required: true },
    response: { type: 'object', description: 'User response data', required: false },
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

  const { toolCallId, toolName, args } = state.pendingToolCall;
  const cwd = state.cwd || '';
  const history = state.conversationHistory || [];

  // Execute the tool
  const argsJson = JSON.stringify(args);
  const result = await executeToolCall(services, toolName, argsJson, cwd);

  // Add tool result to history
  history.push({
    role: 'tool',
    content: result.output,
    tool_call_id: toolCallId,
  } as any);

  // Clear pending state and mark running
  persistCodexState(services, threadId, {
    conversationHistory: history,
    pendingToolCall: undefined,
  });
  setRunning(services, threadId, true);
  updateChatState(services, threadId, 'working');

  // Create new message placeholder for the resumed turn
  const msg = services.chat.sendBlockMessage({
    threadId,
    text: 'Thinking…',
    blocks: [],
    forkable: false,
  });

  const writer = createStreamWriter(services, msg.messageId as EntityId, { intervalMs: 80 });
  const toolActivity = createToolActivityWriter(services, msg.messageId as EntityId, { intervalMs: 250 });

  // Resume the agentic loop
  consumeStream(
    { services, threadId, text: '', phase: undefined },
    { writer, toolActivity, messageId: msg.messageId as EntityId },
  ).catch((err) => {
    log.error('consumeStream error on resume', { err: err?.message });
    setRunning(services, threadId, false);
    updateChatState(services, threadId, 'idle');
  });

  return { success: true };
}
