/**
 * CC: Handle Summarize — "Summarize from here" in the revert menu.
 *
 * Mirrors Claude Code's native `/compact` slash-command with default
 * `direction: 'from'` semantics: pivot X and everything after it are
 * already soft-deleted by the threads system before this action runs,
 * and X's text has been prefilled back into the chat input by the
 * frontend. This action then:
 *
 *   1. Kills any active CLI process.
 *   2. Validates there's a session + a prior assistant `cliUuid` to
 *      anchor the truncation at. Bails (with a user-visible aside) if
 *      either is missing — the destructive soft-delete has already
 *      happened at that point, so silently returning would leave the
 *      user confused.
 *   3. Stores `thread.context.claudeCode.revertTo.cliUuid` so the next
 *      turn passes `--fork-session --resume-session-at <cliUuid>`.
 *   4. Creates a synthetic `/compact` user message — collapsed as an
 *      italic "Summarize from here" aside, non-forkable, so it doesn't
 *      look like the user typed `/compact` at the prompt.
 *   5. Directly invokes `Claude Code Chat` with the `/compact` prompt.
 *      The chat action reads `revertTo`, applies fork+truncate, and
 *      streams back the summary as a normal assistant message.
 *
 * `mode: 'claude-code'` is not involved in the direct invocation — we skip the
 * `user.message` → flow-routing round-trip entirely. This is a
 * Claude-Code-specific feature and goes straight to its action.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { persistClaudeState, getClaudeState, killTurn, updateChatState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CC: Handle Summarize',
  description: 'Truncate the Claude session at a pivot message and run /compact to summarize prior context.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    messageId: { type: 'string', description: 'Pivot message ID', required: true },
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

  // ── 1. Clean up turn state ──────────────────────────────────────────
  // The flow's pause step (CC: Pause Turn) already ran before this
  // action. killTurn() is idempotent — it serves as a safety net to
  // clean up plan drafts, approval blocks, queued messages, and all
  // mid-turn flags if the pause step was skipped or incomplete.
  killTurn(services, threadId);

  // Bail #1: no live session to compact.
  if (!state?.sessionId) {
    updateChatState(services, threadId as EntityId, 'idle');
    services.chat.sendBlockMessage({
      threadId: threadId as EntityId,
      text: '⚠️ Nothing to summarize — no active Claude session yet.',
      blocks: [],
      forkable: false,
    });
    log.info('summarize skipped — no active Claude session', { threadId, messageId });
    return { success: false, reason: 'no active session' };
  }

  // Find the truncation anchor — the last surviving assistant message's
  // `cliUuid`. The system already soft-deleted the pivot and everything
  // after it, so this scans only the pre-pivot messages.
  const threadData = services.repository.chatQueries.threadData(threadId as EntityId);
  const messages = (threadData?.messages ?? []) as Array<{
    id?: string;
    sender?: string;
    context?: Record<string, unknown>;
  }>;
  const lastAssistant = [...messages].reverse().find(
    (m) => m.sender === 'assistant' && m.context?.cliUuid,
  );
  const cliUuid = lastAssistant?.context?.cliUuid as string | undefined;

  // Bail #2: no prior assistant turn to anchor at. `/compact` needs a
  // non-empty transcript to summarize.
  if (!cliUuid) {
    updateChatState(services, threadId as EntityId, 'idle');
    services.chat.sendBlockMessage({
      threadId: threadId as EntityId,
      text: '⚠️ Nothing to summarize — no prior assistant turn before this point.',
      blocks: [],
      forkable: false,
    });
    log.info('summarize skipped — no prior assistant cliUuid to anchor at', { threadId, messageId });
    return { success: false, reason: 'no prior assistant turn' };
  }

  // Arm the one-shot revert flag. The next chat action consumes this and
  // passes `--fork-session --resume-session-at <cliUuid>` to the CLI.
  // Clear forkFrom to prevent a stale fork UUID from overriding the
  // revert's resumeSessionAt value.
  persistClaudeState(services, threadId, {
    revertTo: { cliUuid },
    forkFrom: undefined,
  });

  // Create the synthetic user message. `autoHide: true` + `asideText`
  // renders it as a muted italic chip instead of a full "/compact" bubble;
  // `forkable: false` suppresses the hover Revert/Fork buttons.
  const synth = services.repository.chatCommands.addMessage({
    threadId: threadId as EntityId,
    text: '/compact',
    sender: 'user',
    forkable: false,
    autoHide: true,
    asUser: true,
    asideText: 'Summarize from here',
  });

  // Refresh UI so the FE sees the synthetic message.
  services.chat.openThreadChatAndRefreshRecent(threadId as EntityId);

  // Hand off to the existing chat action. It reads `revertTo`, applies
  // fork+truncate, and runs `/compact` against the truncated session.
  // Fire-and-forget: the chat action streams its own response.
  await services.action.getAndExecute('Claude Code Chat', {
    threadId,
    text: '/compact',
    messageId: synth.id,
  });

  log.debug('summarize dispatched /compact turn', { threadId, messageId, cliUuid });
  return { success: true, cliUuid, syntheticMessageId: synth.id };
}
