/**
 * CC: Stream Paused — flips the session artifact status to
 * `awaiting-input` when the CLI emits a `control_request` that
 * requires user interaction (tool approval, AskUserQuestion, ExitPlanMode).
 *
 * Triggered by the `cc.stream.paused` brain event emitted from the stream
 * consumer. The consumer handles the ordering-critical state (pendingControlRequest,
 * setRunning) synchronously before emitting the event.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { updateChatState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CC: Stream Paused',
  description: 'Updates session artifact status to awaiting-input when the CLI pauses for user input.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    toolName: { type: 'string', description: 'Tool requesting permission', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, toolName } = params as {
    threadId: string;
    toolName?: string;
  };

  if (!threadId) return { success: false, reason: 'missing threadId' };

  updateChatState(services, threadId as EntityId, 'paused');

  return { success: true, toolName };
}
