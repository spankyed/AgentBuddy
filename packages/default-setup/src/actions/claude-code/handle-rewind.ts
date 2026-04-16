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
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getClaudeState } from './_helpers/thread-context';

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

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, messageId, userCliUuid } = params as {
    threadId: string;
    messageId: string;
    userCliUuid?: string;
  };

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

  return { success: true, filesRestored };
}
