import type { ActionMeta } from '@apackdev/sdk/build';
import type { Services, EntityId } from '#generated/services.ts';
import { expirePendingControlRequest, getClaudeState, persistClaudeState, setRunning, updateChatState } from './_helpers/thread-context.ts';

export const meta: ActionMeta = {
  label: 'CC: Answer MCP Elicitation', description: 'Send an explicit URL elicitation choice to the native MCP request.', category: 'claude-code',
  input: { threadId: { type: 'string', required: true }, requestId: { type: 'string', required: true }, response: { type: 'object', required: true } },
};

export async function action(params: { threadId: string; requestId: string; response: { buttonId?: string; cancelled?: boolean } }, services: Services) {
  const { threadId, requestId, response } = params;
  const pending = getClaudeState(services, threadId)?.pendingElicitation;
  if (!pending || pending.requestId !== requestId) return { success: false, reason: 'elicitation is no longer pending' };
  const choice = response?.cancelled ? 'cancel' : response?.buttonId;
  if (choice !== 'accept' && choice !== 'decline' && choice !== 'cancel') return { success: false, reason: 'invalid elicitation response' };
  const handle = services.cli.claudeCode.getHandle(threadId);
  if (!handle) { expirePendingControlRequest(services, threadId, requestId); return { success: false, reason: 'Claude Code request expired' }; }
  try { handle.respondElicitation(requestId, { action: choice }); }
  catch { expirePendingControlRequest(services, threadId, requestId); return { success: false, reason: 'Claude Code elicitation response could not be sent' }; }
  persistClaudeState(services, threadId, { pendingElicitation: undefined }); setRunning(services, threadId, true); updateChatState(services, threadId as EntityId, 'working');
  return { success: true };
}
