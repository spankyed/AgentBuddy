/**
 * CC: Handle Revert — cleans up Claude Code state when a thread is reverted
 * and sets up CLI-level session truncation for the next turn.
 *
 * Triggered by the `thread.revert` brain event with `kind: 'revert'`.
 * Kills any active CLI process, clears turn-level state, and stores a
 * `revertTo` flag with the CLI UUID of the last assistant message before
 * the revert point. The next chat action uses this to pass
 * `--resume-session-at` + `--fork-session` so the CLI creates a truncated
 * forked session.
 *
 * Variant paths (file rewind via `--rewind-files`, or `/compact`
 * summarization) live in sibling actions — `CC: Handle Rewind` and
 * `CC: Handle Summarize` — which delegate the common setup back to this
 * action via `services.action.getAndExecute`.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { persistClaudeState, getClaudeState, updateChatState } from './_helpers/thread-context';

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
  const { threadId, messageId } = params as {
    threadId: string;
    messageId: string;
  };

  if (!threadId) return { success: false, reason: 'missing threadId' };

  const log = services.logger;
  const state = getClaudeState(services, threadId);

  log.debug('[revert] state BEFORE revert', {
    threadId,
    messageId,
    sessionId: state?.sessionId ?? 'NONE',
    isRunning: state?.isRunning ?? false,
    hasForkFrom: !!state?.forkFrom,
    hasRevertTo: !!state?.revertTo,
  });

  // Kill the active CLI process if one is running.
  const handle = services.cli.claudeCode.getHandle(threadId);
  if (handle) {
    log.debug('killing active CLI handle on revert', { threadId });
    handle.kill();
    services.cli.claudeCode.clearHandle(threadId);
  }

  // Find the CLI UUID of the last remaining assistant message.
  // The threads system already soft-deleted the target message and everything
  // after it. By the time this action runs, threadData.messages only has
  // messages before the revert point. The last assistant message with a
  // cliUuid is our truncation target.
  let cliUuid: string | undefined;
  if (state?.sessionId) {
    const threadData = services.repository.chatQueries.threadData(threadId as EntityId);
    const messages = (threadData?.messages ?? []) as Array<{
      id?: string;
      sender?: string;
      context?: Record<string, unknown>;
    }>;
    const lastAssistant = [...messages].reverse().find(
      m => m.sender === 'assistant' && m.context?.cliUuid,
    );
    cliUuid = lastAssistant?.context?.cliUuid as string | undefined;
  }

  // Clear turn-level state and set revert flag.
  persistClaudeState(services, threadId, {
    isRunning: false,
    pendingControlRequest: undefined,
    queuedMessage: undefined,
    ...(cliUuid ? { revertTo: { cliUuid } } : {
      // No CLI UUID found (reverting to first message or no prior assistant).
      // Clear sessionId and any stale one-shot flags so the next turn starts
      // fresh. Without this, a leftover forkFrom or revertTo would cause
      // --resume-session-at to be passed without --resume.
      sessionId: undefined,
      forkFrom: undefined,
      revertTo: undefined,
    }),
  });

  // Flip the session artifact to idle.
  updateChatState(services, threadId as EntityId, 'idle');

  log.debug('[revert] state AFTER revert', {
    threadId,
    messageId,
    cliUuid: cliUuid ?? 'NONE (will start fresh)',
    sessionIdPreserved: !!cliUuid,
    hadActiveHandle: !!handle,
  });

  return { success: true, hadActiveHandle: !!handle, cliUuid };
}
