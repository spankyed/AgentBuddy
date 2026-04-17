/**
 * CC: Approve Tool — sends a tool approval to the CLI and resumes streaming.
 * Handles generic tool approvals (Write, Edit, Bash) and ExitPlanMode.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { persistClaudeState, setRunning, addBackgroundTask } from './_helpers/thread-context';
import { updateSessionArtifact, updateChatState } from './_helpers/session-artifact';
import { resolvePlanDraft } from './_helpers/plan-artifact';
import { syncBackgroundArtifact } from './_helpers/background-artifact';

export const meta: ActionMeta = {
  label: 'CC: Approve Tool',
  description: 'Sends tool approval to the CLI and resumes streaming.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    requestId: { type: 'string', description: 'CLI control_request ID', required: true },
    toolName: { type: 'string', description: 'Tool being approved', required: false },
    originalInput: { type: 'object', description: 'Original tool input from the control_request', required: false },
    response: { type: 'object', description: 'User response from the approval block', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, requestId, toolName, originalInput, response } = params as {
    threadId: string;
    requestId: string;
    toolName?: string;
    originalInput?: Record<string, unknown>;
    response?: { autoAccept?: boolean; background?: boolean };
  };

  if (!threadId || !requestId) return { success: false, reason: 'missing threadId or requestId' };

  const handle = (services.cli as any).claudeCode.getHandle(threadId);
  if (!handle) return { success: false, reason: 'no active CLI handle' };

  // "Allow (Background)" — inject run_in_background: true so the Bash tool
  // returns immediately with a task_id instead of blocking the turn.
  if (response?.background && toolName === 'Bash') {
    const updatedInput = { ...(originalInput ?? {}), run_in_background: true };
    handle.respond(requestId, { behavior: 'allow', updatedInput });
    const command: string = (originalInput as any)?.command ?? 'bash command';
    addBackgroundTask(services, threadId, {
      id: requestId,
      command,
      startedAt: Date.now(),
      status: 'running',
    });
    syncBackgroundArtifact(services, threadId);
    services.emitter.sendToBrainSystem({
      eventType: 'cc.task.backgrounded',
      payload: { threadId, command },
    });
    // Still resume the turn normally — the Bash tool will return quickly.
    persistClaudeState(services, threadId, { pendingControlRequest: undefined });
    setRunning(services, threadId, true);
    updateChatState(services, threadId as EntityId, 'working');
    return { success: true, background: true };
  }

  handle.respond(requestId, { behavior: 'allow', updatedInput: originalInput ?? {} });

  if (toolName === 'ExitPlanMode') {
    resolvePlanDraft(services, threadId as EntityId, 'approved');
    services.emitter.sendToPlugin('threads', { type: 'SET_PHASE', phase: 'edit' });
  }

  // If the user checked "auto-accept file edits", switch for current + future turns.
  if (response?.autoAccept) {
    updateSessionArtifact(services, threadId as EntityId, { permissionMode: 'acceptEdits' });
    persistClaudeState(services, threadId, { pendingControlRequest: undefined, autoAcceptEdits: true });
  } else {
    persistClaudeState(services, threadId, { pendingControlRequest: undefined });
  }
  setRunning(services, threadId, true);
  updateChatState(services, threadId as EntityId, 'working');

  return { success: true };
}
