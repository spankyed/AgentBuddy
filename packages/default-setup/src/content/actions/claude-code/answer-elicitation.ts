import type { ClaudeMcpFormValue } from '#features/code/shared/mcp-elicitation-form.ts';
import type { ActionMeta } from '@apackdev/sdk/build';
import type { Services, EntityId } from '#generated/services.ts';
import { expirePendingControlRequest, getClaudeState, persistClaudeState, setRunning, updateChatState } from './_helpers/thread-context.ts';

export const meta: ActionMeta = {
  label: 'CC: Answer MCP Elicitation', description: 'Send an explicit MCP elicitation choice to the native MCP request.', category: 'claude-code',
  input: { threadId: { type: 'string', required: true }, requestId: { type: 'string', required: true }, response: { type: 'object', required: true } },
};

export async function action(params: { threadId: string; requestId: string; response: { buttonId?: string; cancelled?: boolean; content?: Record<string,unknown> } }, services: Services) {
  const { threadId, requestId, response } = params;
  const pending = getClaudeState(services, threadId)?.pendingElicitation;
  if (!pending || pending.requestId !== requestId) return { success: false, reason: 'elicitation is no longer pending' };
  const choice = response?.cancelled ? 'cancel' : response?.buttonId;
  if (choice !== 'accept' && choice !== 'decline' && choice !== 'cancel') return { success: false, reason: 'invalid elicitation response' };
  const handle = services.cli.claudeCode.getHandle(threadId);
  if (!handle) { expirePendingControlRequest(services, threadId, requestId); return { success: false, reason: 'Claude Code request expired' }; }
  const owner = services.cli.claudeCode.getConversation(threadId)?.owner;
  if (owner && !owner.hasPendingElicitation(requestId)) { expirePendingControlRequest(services, threadId, requestId); return { success: false, reason: 'Claude Code request expired' }; }
  let content: Record<string,ClaudeMcpFormValue> | undefined;
  if (choice === 'accept' && pending.mode === 'form') {
    if (!pending.form) return { success: false, reason: 'form metadata is missing' };
    const checked = services.cli.claudeCode.validateMcpElicitationForm(pending.form, response.content);
    if (!checked.valid) {
      services.chat.updateMessageState(pending.approvalMessageId as EntityId, { responseTimestamp: Date.now(), blockResponse: { validationFailed: true } });
      const retry = services.chat.sendBlockMessage({ threadId: threadId as EntityId, text: pending.message ?? `MCP server ${pending.serverName} requests corrected input.`,
        blocks: [{ type: 'mcp-elicitation', props: { form: pending.form, initialValues: response.content, errors: checked.errors } }], forkable: false, autoHide: true, asUser: true });
      persistClaudeState(services, threadId, { pendingElicitation: { ...pending, approvalMessageId: retry.messageId } });
      return { success: false, reason: 'invalid form content' };
    }
    content = checked.content;
  }
  try { handle.respondElicitation(requestId, { action: choice, ...(content === undefined ? {} : { content }) }); }
  catch { expirePendingControlRequest(services, threadId, requestId); return { success: false, reason: 'Claude Code elicitation response could not be sent' }; }
  persistClaudeState(services, threadId, { pendingElicitation: undefined }); setRunning(services, threadId, true); updateChatState(services, threadId as EntityId, 'working');
  return { success: true };
}
