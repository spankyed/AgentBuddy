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
import { persistClaudeState, getClaudeState } from './_helpers/thread-context';
import { updateChatState, readSessionCwd } from './_helpers/session-artifact';

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
  const sessionId = state?.sessionId;
  if (sessionId) {
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

    // Pre-flight validation: verify the session JSONL actually exists on
    // disk before committing to a fork/revert. If the file is missing
    // (cleaned up, CWD mismatch, etc.), fall back to a fresh start instead
    // of letting the next chat turn error with "Session expired."
    if (cliUuid) {
      const sessionCwd = readSessionCwd(services, threadId as EntityId);
      // Also try the project directory as fallback if sessionCwd is missing.
      const codeSettings = services.repository.settingsQueries.getPluginSettings('code') as any;
      const effectiveCwd = sessionCwd || codeSettings?.defaultBaseDirectory || codeSettings?.lastDirectoryOpened;

      // Quick probe: read just 1 line from the session JSONL. If it throws,
      // the file is missing or unreadable.
      const probe = effectiveCwd
        ? await services.cli.claudeCode.viewSession(sessionId, { cwd: effectiveCwd, limit: 1 }).catch(() => null)
        : null;

      if (!probe) {
        log.warn('[revert] session JSONL not found on disk — falling back to fresh start', {
          threadId,
          sessionId,
          cliUuid,
          sessionCwd: sessionCwd ?? 'NONE',
          effectiveCwd: effectiveCwd ?? 'NONE',
        });
        cliUuid = undefined; // Will trigger fresh-start path below
      } else {
        log.debug('[revert] session JSONL validated', {
          sessionId,
          cliUuid,
          cwd: effectiveCwd,
        });
      }
    }

    log.debug('[revert] message scan', {
      totalRemaining: messages.length,
      assistantsWithUuid: messages.filter(m => m.sender === 'assistant' && m.context?.cliUuid).length,
      cliUuid: cliUuid ?? 'NONE',
    });
  }

  // Clear turn-level state and set revert flag.
  persistClaudeState(services, threadId, {
    isRunning: false,
    pendingControlRequest: undefined,
    queuedMessage: undefined,
    ...(cliUuid ? { revertTo: { cliUuid } } : {
      // No CLI UUID found, or session JSONL missing — clear sessionId and
      // any stale one-shot flags so the next turn starts fresh.
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
