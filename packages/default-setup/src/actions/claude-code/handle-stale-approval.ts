/**
 * CC: Handle Stale Approval — handles user clicking an approval block after
 * an app restart when the CLI process is no longer alive.
 *
 * On restart, paused threads keep their `pendingControlRequest` and the
 * approval block remains interactive. When the user responds, route-response
 * detects the missing CLI handle and returns `staleApproval: true`, routing
 * here instead of the normal approve/deny/answer paths.
 *
 * Deny: invalidate the block, clear state, set idle.
 * Approve: resume the CLI session — the CLI re-reads the JSONL transcript
 *   and re-attempts the pending tool, which is auto-approved via a one-shot
 *   `autoApproveOnResume` flag on the thread context.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getClaudeState, persistClaudeState } from './_helpers/thread-context';
import { updateChatState, updateSessionArtifact } from './_helpers/session-artifact';
import { resolvePlanDraft } from './_helpers/plan-artifact';

export const meta: ActionMeta = {
  label: 'CC: Handle Stale Approval',
  description: 'Handles approval/denial of a stale post-restart permission block by resuming the session or cleaning up.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    denied: { type: 'boolean', description: 'Whether the user denied', required: false },
    clearContext: { type: 'boolean', description: 'Whether clear-context was requested (ExitPlanMode)', required: false },
    toolName: { type: 'string', description: 'Tool that was awaiting approval', required: false },
    requestId: { type: 'string', description: 'Original CLI control_request ID', required: false },
    originalInput: { type: 'object', description: 'Original tool input', required: false },
    response: { type: 'object', description: 'User response from the approval block', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, denied, clearContext, toolName, response } = params as {
    threadId: string;
    denied?: boolean;
    clearContext?: boolean;
    toolName?: string;
    requestId?: string;
    originalInput?: Record<string, unknown>;
    response?: any;
  };

  const log = services.logger;

  if (!threadId) return { success: false, reason: 'missing threadId' };

  const state = getClaudeState(services, threadId);
  const pending = state?.pendingControlRequest;

  // ─── Deny ──────────────────────────────────────────────────────────
  if (denied) {
    log.debug('[stale-approval] denied', { threadId, toolName });

    // Invalidate the approval block.
    if (pending?.approvalMessageId) {
      services.chat.updateMessageState(pending.approvalMessageId as any, {
        responseTimestamp: Date.now(),
        blockResponse: { cancelled: true },
      } as any);
    }

    // If ExitPlanMode was denied, reject the plan draft.
    if (toolName === 'ExitPlanMode') {
      resolvePlanDraft(services, threadId as EntityId, 'rejected');
    }

    persistClaudeState(services, threadId, { pendingControlRequest: undefined });
    updateChatState(services, threadId as EntityId, 'idle');

    return { success: true, action: 'denied' };
  }

  // ─── Approve: ExitPlanMode with clearContext ───────────────────────
  if (clearContext && toolName === 'ExitPlanMode') {
    log.debug('[stale-approval] approve + clear context', { threadId });

    // Invalidate the old approval block before delegating.
    if (pending?.approvalMessageId) {
      services.chat.updateMessageState(pending.approvalMessageId as any, {
        responseTimestamp: Date.now(),
        blockResponse: { approved: true, clearContext: true },
      } as any);
    }

    persistClaudeState(services, threadId, { pendingControlRequest: undefined });
    updateChatState(services, threadId as EntityId, 'idle');

    // Delegate to existing clear-context action which creates a fresh
    // thread with the plan injected and fires a new chat query.
    await services.action.getAndExecute('CC: Approve Plan Clear Context', {
      threadId,
      response,
    });

    return { success: true, action: 'clearContext' };
  }

  // ─── Approve: resume the session ───────────────────────────────────
  log.debug('[stale-approval] approve — resuming session', { threadId, toolName });

  // Invalidate the approval block (it's been acted on).
  if (pending?.approvalMessageId) {
    services.chat.updateMessageState(pending.approvalMessageId as any, {
      responseTimestamp: Date.now(),
      blockResponse: { approved: true },
    } as any);
  }

  // For ExitPlanMode, resolve plan draft and switch phase now.
  if (toolName === 'ExitPlanMode') {
    resolvePlanDraft(services, threadId as EntityId, 'approved');
    services.emitter.sendToPlugin('threads', { type: 'SET_PHASE', phase: 'edit' });
  }

  // If the user opted into auto-accept edits, persist to artifact.
  if (response?.autoAccept) {
    updateSessionArtifact(services, threadId as EntityId, { permissionMode: 'acceptEdits' });
  }

  // Set one-shot flag so the stream consumer auto-approves the re-surfaced
  // control_request when the CLI re-attempts the tool on resume.
  persistClaudeState(services, threadId, {
    pendingControlRequest: undefined,
    autoApproveOnResume: toolName ? { toolName } : undefined,
    ...(response?.autoAccept ? { autoAcceptEdits: true } : {}),
  });

  // Resume the CLI session. The CLI re-reads the JSONL transcript and
  // continues from where it left off.
  const resumeText = toolName === 'ExitPlanMode'
    ? 'Continue — the plan was approved. Proceed with implementation.'
    : 'Continue from where you left off.';

  await services.action.getAndExecute('Claude Code Chat', {
    threadId,
    text: resumeText,
    mode: 'work',
  });

  return { success: true, action: 'resumed' };
}
