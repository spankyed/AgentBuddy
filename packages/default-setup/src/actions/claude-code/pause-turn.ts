/**
 * CC: Pause Turn — kills the CLI process and ends the turn when the user
 * clicks the Pause button.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getClaudeState, persistClaudeState } from './_helpers/thread-context';
import { updateSessionArtifact } from './_helpers/session-artifact';
import { resolvePlanDraft } from './_helpers/plan-artifact';

export const meta: ActionMeta = {
  label: 'CC: Pause Turn',
  description: 'Kills the CLI process and ends the turn on user pause.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId } = params as { threadId: string };

  if (!threadId) return { success: false, reason: 'missing threadId' };

  // No-op if nothing is running.
  const prior = getClaudeState(services, threadId);
  if (!prior?.isRunning && !prior?.pendingControlRequest) {
    return { success: true, noop: true };
  }

  const handle = (services.cli as any).claudeCode.getHandle(threadId);
  if (handle) {
    try { handle.kill(); } catch { /* already gone */ }
    (services.cli as any).claudeCode.clearHandle(threadId);
  }

  // If paused during a plan approval, reject the draft.
  if (prior?.pendingControlRequest?.toolName === 'ExitPlanMode') {
    resolvePlanDraft(services, threadId as EntityId, 'rejected');
  }

  persistClaudeState(services, threadId, {
    pendingControlRequest: undefined,
    isRunning: false,
  });
  updateSessionArtifact(services, threadId as EntityId, { status: 'idle' });

  return { success: true };
}
