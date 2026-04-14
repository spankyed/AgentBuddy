/**
 * CC: Pause Turn — kills the CLI process and ends the turn when the user
 * clicks the Pause button.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getClaudeState, killTurn } from './_helpers/thread-context';
import { updateSessionArtifact } from './_helpers/session-artifact';

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

  killTurn(services, threadId);
  updateSessionArtifact(services, threadId as EntityId, { status: 'idle' });

  return { success: true };
}
