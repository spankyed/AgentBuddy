/**
 * CDX: Update Session Settings - persists Codex approval/sandbox choices.
 */

import type { ActionMeta, Services } from '../../types';
import { persistCodexState } from './_helpers/thread-context';

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

  const patch: Record<string, string> = {};
  if (approvalMode) {
    if (!APPROVAL_MODES.has(approvalMode)) return { success: false, reason: 'invalid approvalMode' };
    patch.approvalMode = approvalMode;
  }
  if (sandbox) {
    if (!SANDBOX_MODES.has(sandbox)) return { success: false, reason: 'invalid sandbox' };
    patch.sandbox = sandbox;
  }
  if (Object.keys(patch).length === 0) return { success: false, reason: 'nothing to update' };

  persistCodexState(services, threadId, patch as any);
  return { success: true };
}
