/**
 * CC: Handle Revert — cleans up Claude Code state when a thread is reverted
 * and sets up CLI-level session truncation for the next turn.
 *
 * Triggered by the `thread.revert` brain event. Kills any active CLI
 * process, clears turn-level state, and stores a `revertTo` flag with
 * the CLI UUID of the last assistant message before the revert point.
 * The next chat action uses this to pass `--resume-session-at` +
 * `--fork-session` so the CLI creates a truncated forked session.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { persistClaudeState, getClaudeState } from './_helpers/thread-context';
import { updateSessionArtifact } from './_helpers/session-artifact';

export const meta: ActionMeta = {
  label: 'CC: Handle Revert',
  description: 'Cleans up Claude Code state and sets up CLI session truncation on revert.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    messageId: { type: 'string', description: 'Message ID being reverted to', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, messageId } = params as { threadId: string; messageId: string };

  if (!threadId) return { success: false, reason: 'missing threadId' };

  const log = services.logger;
  const state = getClaudeState(services, threadId);

  // Kill the active CLI process if one is running.
  const handle = (services.cli as any).claudeCode.getHandle(threadId);
  if (handle) {
    log.debug('killing active CLI handle on revert', { threadId });
    handle.kill();
    (services.cli as any).claudeCode.clearHandle(threadId);
  }

  // Find the CLI UUID of the last assistant message before the revert point.
  // The revert target is a user message; we need the assistant message
  // immediately preceding it so --resume-session-at truncates correctly.
  let cliUuid: string | undefined;
  if (messageId && state?.sessionId) {
    const threadData = services.repository.chatQueries.threadData(threadId as EntityId);
    const messages = (threadData?.messages ?? []) as Array<{
      id?: string;
      sender?: string;
      context?: Record<string, unknown>;
      deleted?: boolean;
    }>;
    // threadData.messages are already filtered to non-deleted.
    const nonDeleted = messages.filter(m => m.id && !m.deleted);
    const targetIndex = nonDeleted.findIndex(m => m.id === messageId);
    if (targetIndex > 0) {
      // Walk backwards from the target to find the last assistant message.
      for (let i = targetIndex - 1; i >= 0; i--) {
        const msg = nonDeleted[i];
        if (msg.sender === 'assistant' && msg.context?.cliUuid) {
          cliUuid = msg.context.cliUuid as string;
          break;
        }
      }
    }
  }

  // Clear turn-level state and set revert flag.
  persistClaudeState(services, threadId, {
    isRunning: false,
    pendingControlRequest: undefined,
    queuedMessage: undefined,
    ...(cliUuid ? { revertTo: { cliUuid } } : {
      // No CLI UUID found (reverting to first message or no prior assistant).
      // Clear sessionId so the next turn starts fresh.
      sessionId: undefined,
    }),
  });

  // Flip the session artifact to idle.
  updateSessionArtifact(services, threadId as EntityId, { status: 'idle' });

  log.debug('revert handled', { threadId, messageId, cliUuid: cliUuid ?? 'none (fresh session)' });

  return { success: true, hadActiveHandle: !!handle, cliUuid };
}
