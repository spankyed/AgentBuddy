/**
 * CC: Handle Rewind — "Revert and rewind code" variant of revert.
 *
 * Triggered by the `thread.revert` brain event with `kind: 'rewind'`.
 * Does everything `CC: Handle Revert` does, and additionally spawns a
 * one-shot `claude --resume <sessionId> --rewind-files <userCliUuid>`
 * to restore files on disk to their state at the reverted user message.
 *
 * Reuses `CC: Handle Revert` via `services.action.getAndExecute` for the
 * common setup (CLI kill, cliUuid lookup, persistClaudeState,
 * updateChatState) so the two paths stay in sync.
 *
 * If the frontend didn't supply `userCliUuid` (pre-existing threads where
 * the stream-consumer never wrote `msg.context.cliUuid`), we lazily
 * backfill from Claude's own session JSONL transcript before bailing.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getClaudeState } from './_helpers/thread-context';
import { backfillUserCliUuids } from './_helpers/jsonl-backfill';

export const meta: ActionMeta = {
  label: 'CC: Handle Rewind',
  description: 'Revert plus restoring files to their state at the reverted message via `claude --rewind-files`.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    messageId: { type: 'string', description: 'Message ID being reverted to', required: true },
    userCliUuid: { type: 'string', description: 'CLI UUID of the reverted user message', required: false },
  },
};

/**
 * Classify a `--rewind-files` failure message into a user-facing aside
 * and flag whether it represents an infrastructural health issue (our
 * env-var fix not being honored by the installed Claude CLI).
 */
function classifyRewindFailure(raw: string | undefined): { text: string; isHealthIssue: boolean } {
  const detail = (raw ?? '').toLowerCase();
  if (/file rewinding is not enabled/.test(detail)) {
    return {
      text: '⚠️ Claude CLI reports file rewinding is disabled. The `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING` env var may not be recognized by your installed Claude version.',
      isHealthIssue: true,
    };
  }
  if (/no file history|file history not found|no snapshot/.test(detail)) {
    return {
      text: '⚠️ This thread predates file-history support — start a fresh thread and file rewind will work on future turns.',
      isHealthIssue: false,
    };
  }
  return {
    text: `⚠️ Could not restore files — ${raw ?? 'rewind call failed'}.`,
    isHealthIssue: false,
  };
}

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, messageId } = params as {
    threadId: string;
    messageId: string;
  };
  let { userCliUuid } = params as { userCliUuid?: string };

  if (!threadId) return { success: false, reason: 'missing threadId' };

  const log = services.logger;

  // Read sessionId BEFORE the common setup — `CC: Handle Revert` may
  // clear it (no-prior-assistant case) as part of its persistClaudeState
  // call, but the one-shot `--rewind-files` still needs the original
  // sessionId to find the JSONL transcript.
  const priorState = getClaudeState(services, threadId);
  const sessionId = priorState?.sessionId;

  // Common setup (kill CLI, find cliUuid, persist revertTo, idle state).
  await services.action.getAndExecute('CC: Handle Revert', { threadId, messageId });

  // Nothing more to do without a session.
  if (!sessionId) {
    log.info('rewind skipped — no active Claude session', { threadId, messageId });
    return { success: false, reason: 'no active session', filesRestored: false };
  }

  // Lazy backfill: if the frontend didn't pass userCliUuid (pre-existing
  // thread, or stream-consumer didn't capture it), pull missing uuids
  // from the session JSONL and re-read the pivot message.
  if (!userCliUuid) {
    const backfilled = await backfillUserCliUuids(services, threadId as EntityId);
    if (backfilled > 0) {
      const msg = services.repository.chatQueries.messageById(messageId as EntityId) as
        | { context?: Record<string, unknown> }
        | null;
      const recovered = msg?.context?.cliUuid;
      if (typeof recovered === 'string' && recovered.length > 0) {
        userCliUuid = recovered;
        log.debug('rewind: recovered userCliUuid via JSONL backfill', { threadId, messageId });
      }
    }
  }

  if (!userCliUuid) {
    log.warn('no CLI UUID on reverted user message — cannot restore files', { messageId });
    services.chat.sendBlockMessage({
      threadId: threadId as EntityId,
      text: '⚠️ Could not restore files — no CLI UUID on the reverted user message.',
      blocks: [],
      forkable: false,
    });
    return { success: false, reason: 'no userCliUuid', filesRestored: false };
  }

  // One-shot rewind. exec() keeps this light — query() would spin up
  // full pump/event-queue plumbing for a CLI that exits immediately.
  log.debug('restoring files via --rewind-files', { threadId, userCliUuid });
  let filesRestored = false;
  let failureDetail: string | undefined;
  try {
    const result = await services.cli.claudeCode.exec([
      '--resume', sessionId,
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
    // Classify the failure so the aside gives actionable information
    // rather than raw CLI stderr.
    const { text, isHealthIssue } = classifyRewindFailure(failureDetail);
    if (isHealthIssue) {
      // Loud signal for maintainers: our env-var fix should prevent the
      // "not enabled" error. Seeing it means Claude renamed the flag or
      // the installed version predates SDK file checkpointing — worth
      // surfacing in server logs at error level.
      log.error(
        'Claude CLI does not recognize CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING — possible rename in installed Claude version',
        { threadId, stderr: failureDetail },
      );
    }
    services.chat.sendBlockMessage({
      threadId: threadId as EntityId,
      text,
      blocks: [],
      forkable: false,
    });
  }

  return { success: true, filesRestored };
}
