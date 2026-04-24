/**
 * CC: Update Worktree — persists the user's worktree toggle to thread context.
 */

import type { ActionMeta, Services } from '../../types';
import { persistClaudeState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CC: Update Worktree',
  description: 'Persists the worktree toggle to thread context.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    useWorktree: { type: 'boolean', description: 'Whether to use a worktree', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, useWorktree } = params as { threadId: string; useWorktree: boolean };
  if (!threadId) return { success: false, reason: 'missing threadId' };

  persistClaudeState(services, threadId, { useWorktree });

  return { success: true };
}
