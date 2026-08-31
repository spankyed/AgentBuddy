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
    networkAccess: { type: 'boolean', description: 'Enable network in workspace-write sandbox', required: false },
    webSearch: { type: 'string', description: 'Web search mode: live, cached, disabled', required: false },
  },
};

const APPROVAL_MODES = new Set(['user', 'auto_review']);
const SANDBOX_MODES = new Set(['read-only', 'workspace-write', 'danger-full-access']);
const WEB_SEARCH_MODES = new Set(['live', 'cached', 'disabled']);

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, approvalMode, sandbox, networkAccess, webSearch } = params as {
    threadId: string;
    approvalMode?: string;
    sandbox?: string;
    networkAccess?: boolean;
    webSearch?: string;
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
  if (networkAccess !== undefined) {
    patch.networkAccess = !!networkAccess;
  }
  if (webSearch) {
    if (!WEB_SEARCH_MODES.has(webSearch)) return { success: false, reason: 'invalid webSearch' };
    patch.webSearch = webSearch;
  }
  if (Object.keys(patch).length === 0) return { success: false, reason: 'nothing to update' };

  // Auto-approve pending tool requests when switching to auto_review
  if (approvalMode === 'auto_review') {
    const prior = getCodexState(services, threadId);
    const pending = prior?.pendingApproval;

    // Only auto-approve tool approvals, not plan approvals (sentinel -1).
    // JSON-RPC request IDs can be 0, so check the method instead of truthiness.
    if (pending && pending.method !== 'plan/approval') {
      try {
        await (services.codex as any).respondToApproval(pending.requestId, 'acceptForSession');
      } catch { /* app-server may be gone */ }

      const asideText = `✓ Approved — ${pending.summary || 'tool request'}`;
      services.chat.updateMessageState(pending.approvalMessageId as EntityId, {
        responseTimestamp: Date.now(),
        blockResponse: { approved: true, decision: 'acceptForSession' },
        asideText,
      } as any);

      patch.pendingApproval = undefined;
      patch.isRunning = true;
    }
  }

  persistCodexState(services, threadId, patch as any);

  if (patch.isRunning) {
    updateChatState(services, threadId as EntityId, 'working');
  }

  // Apply config-level settings via app-server
  const codex = services.codex as any;
  if (networkAccess !== undefined) {
    try {
      await codex.writeConfigValue({ keyPath: 'sandbox_workspace_write.network_access', value: networkAccess, mergeStrategy: 'replace' });
    } catch { /* app-server may not be ready */ }
  }
  if (webSearch) {
    try {
      const value = webSearch === 'cached' ? null : webSearch;
      await codex.writeConfigValue({ keyPath: 'web_search', value, mergeStrategy: 'replace' });
    } catch { /* app-server may not be ready */ }
  }

  return { success: true };
}
