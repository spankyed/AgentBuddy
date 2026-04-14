/**
 * CC: Deny Tool — kills the CLI process and stops the turn when the user
 * denies a tool approval or cancels an interaction.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { killTurn } from './_helpers/thread-context';
import { updateSessionArtifact } from './_helpers/session-artifact';

export const meta: ActionMeta = {
  label: 'CC: Deny Tool',
  description: 'Kills the CLI process and stops the turn on denial.',
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

  killTurn(services, threadId);
  updateSessionArtifact(services, threadId as EntityId, { status: 'idle' });

  return { success: true };
}
