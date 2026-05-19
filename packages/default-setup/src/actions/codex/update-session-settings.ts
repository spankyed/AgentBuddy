/**
 * CDX: Update Session Settings — persists Codex approval/sandbox choices
 * and auto-approves pending tool requests when switching to auto_review.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getCodexState, persistCodexState, updateChatState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CDX: Update Session Settings',
  description: 'Persists Codex session settings to thread context.',
  category: 'codex',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    approvalMode: { type: 'string', description: 'Codex approval review mode', required: false },
    sandbox: { type: 'string', description: 'Codex sandbox mode', required: false },
  },
};

const APPROVAL_MODES = new Set(['user', 'auto_review']);
const SANDBOX_MODES = new Set(['read-only', 'workspace-write', 'danger-full-access']);

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, approvalMode, sandbox } = params as {
    threadId: string;
    approvalMode?: string;
    sandbox?: string;
  };
  if (!threadId) return { success: false, reason: 'missing threadId' };

  const patch: Record<string, any> = {};
  if (approvalMode) {
    if (!APPROVAL_MODES.has(approvalMode)) return { success: false, reason: 'invalid approvalMode' };
    patch.approvalMode = approvalMode;
  }
  if (sandbox) {
    if (!SANDBOX_MODES.has(sandbox)) return { success: false, reason: 'invalid sandbox' };
    patch.sandbox = sandbox;
  }
  if (Object.keys(patch).length === 0) return { success: false, reason: 'nothing to update' };

  // Auto-approve pending tool requests when switching to auto_review
  if (approvalMode === 'auto_review') {
    const prior = getCodexState(services, threadId);
    const pending = prior?.pendingApproval;

    // Only auto-approve tool approvals (requestId > 0), not plan approvals (sentinel -1)
    if (pending?.requestId && pending.requestId !== -1) {
      try {
        (services.codex as any).respondToApproval(pending.requestId, 'acceptForSession');
      } catch { /* app-server may be gone */ }

      services.chat.updateMessageState(pending.approvalMessageId as EntityId, {
        responseTimestamp: Date.now(),
        blockResponse: { decision: 'acceptForSession' },
      } as any);

      patch.pendingApproval = undefined;
      patch.isRunning = true;
    }
  }

  persistCodexState(services, threadId, patch as any);

  if (patch.isRunning) {
    updateChatState(services, threadId as EntityId, 'working');
  }

  return { success: true };
}
