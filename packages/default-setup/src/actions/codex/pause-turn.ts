/**
 * CDX: Pause Turn — aborts the running Codex turn when the user clicks
 * the Pause button.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getCodexState, killTurn, updateChatState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CDX: Pause Turn',
  description: 'Aborts the running Codex turn on user pause.',
  category: 'codex',
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
  const prior = getCodexState(services, threadId);
  if (!prior?.isRunning) {
    return { success: true, noop: true };
  }

  killTurn(services, threadId);
  updateChatState(services, threadId as EntityId, 'idle');

  return { success: true };
}
