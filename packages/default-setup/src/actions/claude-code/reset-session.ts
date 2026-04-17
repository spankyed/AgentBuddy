/**
 * Claude Code Reset Session — drops the Claude Code state off a thread.
 *
 * Clears `thread.context.claudeCode` and removes the `claude-session` tag.
 * The next `Claude Code Chat` turn in the thread will start a brand-new
 * Claude Code session. The on-disk JSONL from the prior session is NOT
 * deleted — it's still recoverable via `claudeCode.sessions.list()`.
 */

import type { ActionMeta, Services, Z, EntityId } from '../../types';
import { clearClaudeState } from './_helpers/thread-context';
import { syncBackgroundArtifact } from './_helpers/background-artifact';

export const meta: ActionMeta = {
  label: 'Claude Code Reset Session',
  description: 'Disconnect a thread from its Claude Code session. The next work-mode turn starts fresh.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Target thread', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  _z: Z,
  _flowId: string,
) {
  const { threadId } = params as { threadId: EntityId };

  if (!threadId) {
    return { success: false, error: 'threadId is required' };
  }

  try {
    clearClaudeState(services, threadId);
    syncBackgroundArtifact(services, threadId as string);
    services.chat.sendBlockMessage({
      threadId,
      text: 'Claude Code session reset for this thread.',
      blocks: [],
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to reset Claude Code session' };
  }
}
