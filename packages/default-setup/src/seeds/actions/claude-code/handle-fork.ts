/**
 * CC: Handle Fork — initializes Claude Code session state on a forked thread
 * and sets up CLI-level session truncation at the fork point.
 *
 * Triggered by the `thread.fork` brain event. Copies the sessionId, looks up
 * the fork-point message's CLI UUID, and stores a `forkFrom` marker so the
 * next chat action passes `--fork-session --resume-session-at <uuid>` to the
 * CLI, creating an isolated JSONL transcript truncated to the fork point.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getClaudeState, persistClaudeState, dequeueMessage } from './_helpers/thread-context';
import { replayQueuedMessage } from './_helpers/stream-consumer';

export const meta: ActionMeta = {
  label: 'CC: Handle Fork',
  description: 'Copies Claude Code session state to a forked thread with CLI-level truncation at the fork point.',
  category: 'claude-code',
  input: {
    sourceThreadId: { type: 'string', description: 'Original thread ID', required: true },
    newThreadId: { type: 'string', description: 'Forked thread ID', required: true },
    sourceMessageId: { type: 'string', description: 'Message ID at the fork point', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { sourceThreadId, newThreadId, sourceMessageId } = params as {
    sourceThreadId: string;
    newThreadId: string;
    sourceMessageId?: string;
  };

  if (!sourceThreadId || !newThreadId) {
    if (newThreadId) {
      persistClaudeState(services, newThreadId, { forkPending: undefined });
      const queued = dequeueMessage(services, newThreadId);
      if (queued) await replayQueuedMessage(services, newThreadId as EntityId, queued, services.logger);
    }
    return { success: false, reason: 'missing sourceThreadId or newThreadId' };
  }

  const log = services.logger;
  const sourceState = getClaudeState(services, sourceThreadId);
  if (!sourceState?.sessionId) {
    persistClaudeState(services, newThreadId, { forkPending: undefined });
    const queued = dequeueMessage(services, newThreadId);
    if (queued) await replayQueuedMessage(services, newThreadId as EntityId, queued, log);
    return { success: true, copied: false };
  }

  // Find the CLI UUID at the fork point so the CLI truncates correctly.
  // The fork-point message could be user or assistant. Walk backwards from
  // it to find the nearest assistant message with a cliUuid.
  let cliUuid: string | undefined;
  if (sourceMessageId) {
    const threadData = services.repository.chatQueries.threadData(sourceThreadId as EntityId);
    const messages = (threadData?.messages ?? []) as Array<{
      id?: string;
      sender?: string;
      context?: Record<string, unknown>;
    }>;
    const targetIndex = messages.findIndex(m => m.id === sourceMessageId);
    if (targetIndex >= 0) {
      // The fork-point message itself might be an assistant message with a cliUuid.
      // Otherwise walk backwards to find the nearest one.
      for (let i = targetIndex; i >= 0; i--) {
        const msg = messages[i];
        if (msg.sender === 'assistant' && msg.context?.cliUuid) {
          cliUuid = msg.context.cliUuid as string;
          break;
        }
      }
    }
  }

  // Validate cliUuid exists in current session JSONL (post-compaction guard).
  // After compaction the sessionId changes but existing messages retain
  // cliUuids from the old session. Passing a stale UUID to
  // --resume-session-at would trigger "No message found" / "Session not found".
  // Same pattern as handle-revert.ts:79-107.
  if (cliUuid && sourceState.sessionId) {
    let uuidValid = false;
    try {
      const transcript = await services.cli.claudeCode.viewSession(
        sourceState.sessionId,
        { cwd: sourceState.cwd },
      ) as Array<Record<string, unknown>>;
      uuidValid = transcript.some(
        (e: any) => e.type === 'assistant' && e.uuid === cliUuid,
      );
    } catch (err: any) {
      log.warn('[fork] could not validate cliUuid against session JSONL', {
        sourceThreadId, sessionId: sourceState.sessionId, cliUuid, err: err?.message,
      });
    }
    if (!uuidValid) {
      log.info('[fork] cliUuid not found in current session (likely post-compaction) — forking from end', {
        sourceThreadId, cliUuid, sessionId: sourceState.sessionId,
      });
      cliUuid = undefined;
    }
  }

  persistClaudeState(services, newThreadId, {
    sessionId: sourceState.sessionId,
    sessionWorktree: sourceState.sessionWorktree,
    lastTurnAt: sourceState.lastTurnAt,
    cwd: sourceState.cwd,
    forkFrom: { sessionId: sourceState.sessionId, cliUuid },
    forkPending: undefined,
  });

  log.debug('copied session state to forked thread', {
    sourceThreadId,
    newThreadId,
    sessionId: sourceState.sessionId,
    cliUuid: cliUuid ?? 'none (will fork from end)',
  });

  const queued = dequeueMessage(services, newThreadId);
  if (queued) await replayQueuedMessage(services, newThreadId as EntityId, queued, log);

  return { success: true, copied: true, sessionId: sourceState.sessionId, cliUuid };
}
