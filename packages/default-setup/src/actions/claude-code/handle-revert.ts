/**
 * CC: Handle Revert — cleans up Claude Code state when a thread is reverted
 * and sets up CLI-level session truncation for the next turn.
 *
 * Triggered by the `thread.revert` brain event. Kills any active CLI
 * process, clears turn-level state, and stores a `revertTo` flag with
 * the CLI UUID of the last assistant message before the revert point.
 * The next chat action uses this to pass `--resume-session-at` +
 * `--fork-session` so the CLI creates a truncated forked session.
 *
 * When `restoreFiles` is true (right-click revert), also spawns a one-shot
 * `claude --resume <sessionId> --rewind-files <userCliUuid>` to restore
 * files to their state at the reverted message.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { persistClaudeState, getClaudeState } from './_helpers/thread-context';
import { updateChatState } from './_helpers/session-artifact';

export const meta: ActionMeta = {
  label: 'CC: Handle Revert',
  description: 'Cleans up Claude Code state and sets up CLI session truncation on revert.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    messageId: { type: 'string', description: 'Message ID being reverted to', required: true },
    restoreFiles: { type: 'boolean', description: 'Also restore files to pre-edit state', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, messageId, restoreFiles, userCliUuid: userCliUuidParam } = params as {
    threadId: string;
    messageId: string;
    restoreFiles?: boolean;
    userCliUuid?: string;
  };

  if (!threadId) return { success: false, reason: 'missing threadId' };

  const log = services.logger;
  const state = getClaudeState(services, threadId);

  // Kill the active CLI process if one is running.
  const handle = services.cli.claudeCode.getHandle(threadId);
  if (handle) {
    log.debug('killing active CLI handle on revert', { threadId });
    handle.kill();
    services.cli.claudeCode.clearHandle(threadId);
  }

  // Find the CLI UUID of the last remaining assistant message.
  // The threads system already soft-deleted the target message and everything
  // after it (softDeleteMessagesAfter now includes the target). By the time
  // this action runs, threadData.messages only has messages before the revert
  // point. The last assistant message with a cliUuid is our truncation target.
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

  // If restoreFiles requested, use the user message's CLI UUID (passed from
  // the frontend which reads it before the message is soft-deleted).
  let filesRestored = false;
  if (restoreFiles && state?.sessionId) {
    const userCliUuid = userCliUuidParam;

    if (userCliUuid) {
      log.debug('restoring files via --rewind-files', { threadId, userCliUuid });
      let failureDetail: string | undefined;
      try {
        // Use execOnce for the one-shot rewind — query() is too heavy
        // (full pump/event-queue plumbing for a CLI that exits immediately).
        const result = await services.cli.claudeCode.exec([
          '--resume', state.sessionId,
          '--rewind-files', userCliUuid,
        ]);
        filesRestored = result.exitCode === 0;
        if (!filesRestored) {
          failureDetail = (result.stderr || '').trim() || `exit ${result.exitCode}`;
          log.warn('file restore exited with non-zero', { exitCode: result.exitCode, stderr: result.stderr });
        } else {
          log.debug('files restored successfully');
        }
      } catch (rewindErr: any) {
        failureDetail = rewindErr?.message || 'unknown error';
        log.warn('file restore failed', { message: rewindErr?.message });
      }
      if (!filesRestored) {
        // Surface the failure so the user isn't left thinking files were
        // restored when they weren't. Inline message, not auto-hidden —
        // this is an action they explicitly requested and the outcome
        // diverged from expectation.
        services.chat.sendBlockMessage({
          threadId: threadId as EntityId,
          text: `⚠️ Could not restore files — ${failureDetail ?? 'rewind call failed'}.`,
          blocks: [],
          forkable: false,
        });
      }
    } else {
      log.warn('no CLI UUID on reverted user message — cannot restore files', { messageId });
      services.chat.sendBlockMessage({
        threadId: threadId as EntityId,
        text: '⚠️ Could not restore files — no CLI UUID on the reverted user message.',
        blocks: [],
        forkable: false,
      });
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
  updateChatState(services, threadId as EntityId, 'idle');

  log.debug('revert handled', {
    threadId,
    messageId,
    cliUuid: cliUuid ?? 'none (fresh session)',
    filesRestored,
  });

  return { success: true, hadActiveHandle: !!handle, cliUuid, filesRestored };
}
