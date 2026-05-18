/** CDX: Pause Turn — interrupts the running Codex turn on user pause. */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getCodexState, killTurn, updateChatState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CDX: Pause Turn',
  description: 'Interrupts the running Codex turn.',
  category: 'codex',
  input: { threadId: { type: 'string', required: true } },
};

export async function action(params: Record<string, any>, services: Services) {
  const { threadId } = params as { threadId: string };
  if (!threadId) return { success: false, reason: 'missing threadId' };

  const prior = getCodexState(services, threadId);
  if (!prior?.isRunning && !prior?.pendingApproval) return { success: true, noop: true };

  killTurn(services, threadId);
  updateChatState(services, threadId as EntityId, 'idle');
  return { success: true };
}
