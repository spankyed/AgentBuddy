/**
 * CC: Deny Turn — kills the CLI process and stops the turn when the user
 * denies a tool approval or cancels an interaction.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { persistClaudeState } from './_helpers/thread-context';
import { updateSessionArtifact } from './_helpers/session-artifact';
import { resolvePlanDraft } from './_helpers/plan-artifact';

export const meta: ActionMeta = {
  label: 'CC: Deny Turn',
  description: 'Kills the CLI process and stops the turn on denial.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    toolName: { type: 'string', description: 'Tool that was denied', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, toolName } = params as { threadId: string; toolName?: string };

  if (!threadId) return { success: false, reason: 'missing threadId' };

  const handle = (services.cli as any).claudeCode.getHandle(threadId);
  if (handle) {
    handle.kill();
    (services.cli as any).claudeCode.clearHandle(threadId);
  }

  if (toolName === 'ExitPlanMode') {
    resolvePlanDraft(services, threadId as EntityId, 'rejected');
  }

  persistClaudeState(services, threadId, {
    pendingControlRequest: undefined,
    isRunning: false,
  });
  updateSessionArtifact(services, threadId as EntityId, { status: 'idle' });

  return { success: true };
}
