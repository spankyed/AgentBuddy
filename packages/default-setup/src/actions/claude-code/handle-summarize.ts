/**
 * CC: Handle Summarize — "Summarize from here" in the revert menu.
 *
 * Matches Claude Code's native `/compact` slash-command with default
 * `direction: 'from'` semantics: pivot message X and everything after it
 * are already soft-deleted by the threads system before this action runs,
 * and X's text has been prefilled back into the chat input by the
 * frontend. This action then:
 *
 *   1. Kills any active CLI process.
 *   2. Finds the last surviving assistant `cliUuid` as the truncation anchor.
 *   3. Stores it under `thread.context.claudeCode.revertTo.cliUuid` so the
 *      next turn passes `--fork-session --resume-session-at <cliUuid>`.
 *   4. Dispatches a synthetic USER_MSG carrying `/compact` as the next
 *      turn's text. That re-enters the existing `user.message` →
 *      `Claude Code Chat` flow, so the CLI runs `/compact` against the
 *      truncated forked session and streams back a summary as a normal
 *      assistant message. No CLI changes required.
 *
 * Bail-out: if there's no live session (`state.sessionId` missing) or no
 * prior assistant with a `cliUuid`, there's nothing to compact — log and
 * return without firing the USER_MSG.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { persistClaudeState, getClaudeState } from './_helpers/thread-context';
import { updateChatState } from './_helpers/session-artifact';

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

  // Kill the active CLI process if one is running.
  const handle = services.cli.claudeCode.getHandle(threadId);
  if (handle) {
    log.debug('killing active CLI handle on summarize', { threadId });
    handle.kill();
    services.cli.claudeCode.clearHandle(threadId);
  }

  // Need an existing session to have anything to summarize.
  if (!state?.sessionId) {
    log.info('summarize skipped — no active Claude session', { threadId, messageId });
    updateChatState(services, threadId as EntityId, 'idle');
    return { success: false, reason: 'no active session' };
  }

  // Find the CLI UUID of the last remaining assistant message (post
  // soft-delete). Mirrors handle-revert's truncation-anchor logic.
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

  if (!cliUuid) {
    log.info('summarize skipped — no prior assistant cliUuid to anchor at', { threadId, messageId });
    updateChatState(services, threadId as EntityId, 'idle');
    return { success: false, reason: 'no prior assistant turn' };
  }

  // Clear turn-level state and set the one-shot revert flag. The next
  // turn's chat action consumes `revertTo` and passes
  // `--fork-session --resume-session-at <cliUuid>` to the CLI.
  persistClaudeState(services, threadId, {
    isRunning: false,
    pendingControlRequest: undefined,
    queuedMessage: undefined,
    revertTo: { cliUuid },
  });

  updateChatState(services, threadId as EntityId, 'idle');

  // Synthesize a `/compact` user message. Re-entering USER_MSG (rather
  // than calling the chat action directly) keeps all the normal plumbing:
  // the message record is created, MESSAGE_ADDED is emitted to the FE,
  // the brain fires `user.message`, and `claude-code-flow` routes it to
  // `Claude Code Chat`, which reads revertTo and runs `/compact` against
  // the truncated forked session.
  services.emitter.sendToSystem('threads', {
    type: 'USER_MSG',
    text: '/compact',
    mode: 'work',
    threadId: threadId as string,
  } as any);

  log.debug('summarize handed off to /compact turn', { threadId, messageId, cliUuid });
  return { success: true, cliUuid };
}
