/**
 * CC: Kanban Start — kicks off a Claude Code session when a thread is
 * dragged to "In Progress" on the kanban board.
 *
 * Reads the thread's `instructions` field and fires a `user.message` brain
 * event so the existing `on("user.message")` track in claude-code-flow
 * handles the rest (routing to "Claude Code Chat").
 *
 * The `userInduced` guard prevents re-triggering when status is set
 * programmatically (e.g. chatState sync sets "In Review" / "Done").
 */

import type { ActionMeta, Services } from '../../types';
import { getClaudeState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CC: Kanban Start',
  description: 'Starts a Claude Code session when a thread is dragged to In Progress on the kanban board.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    status: { type: 'string', description: 'New thread status', required: true },
    userInduced: { type: 'boolean', description: 'Whether the status change was user-initiated', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, status, userInduced } = params as {
    threadId: string;
    status: string;
    userInduced?: boolean;
  };

  if (!threadId || status !== 'In Progress') {
    return { success: false, reason: 'not applicable' };
  }

  // Only trigger on user-initiated status changes (kanban drag), not programmatic ones.
  if (userInduced === false) {
    return { success: false, reason: 'programmatic status change' };
  }

  const thread = services.repository.threadQueries.byId(threadId as any) as any;
  if (!thread) return { success: false, reason: 'thread not found' };

  const instructions = thread.instructions?.trim();
  if (!instructions) return { success: false, reason: 'no instructions' };

  // Don't start if a session is already running on this thread.
  const ccState = getClaudeState(services, threadId);
  if (ccState?.isRunning) return { success: false, reason: 'already running' };

  // Fire a user.message brain event — the existing on("user.message") track
  // in claude-code-flow will route this to "Claude Code Chat".
  services.emitter.sendToBrainSystem({
    eventType: 'user.message',
    payload: { threadId, text: instructions, mode: 'work', phase: 'plan' },
  });

  return { success: true };
}
