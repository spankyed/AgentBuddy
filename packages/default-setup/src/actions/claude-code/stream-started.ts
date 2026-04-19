/**
 * CC: Stream Started — updates the session artifact with the CLI's session
 * details (sessionId, model, cwd) when the stream consumer receives the
 * first `system/init` event.
 *
 * Triggered by the `cc.stream.started` brain event emitted from the stream
 * consumer. This action is the single writer for session identity fields on
 * the artifact — the consumer only persists the sessionId to thread context
 * (critical for resume), while this action handles the UI-facing card.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { updateSessionArtifact } from './_helpers/session-artifact';

export const meta: ActionMeta = {
  label: 'CC: Stream Started',
  description: 'Updates the session artifact with CLI session details when streaming begins.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    sessionId: { type: 'string', description: 'CLI session ID', required: false },
    model: { type: 'string', description: 'Model used', required: false },
    cwd: { type: 'string', description: 'Working directory', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, sessionId, model, cwd } = params as {
    threadId: string;
    sessionId?: string;
    model?: string;
    cwd?: string;
  };

  if (!threadId) return { success: false, reason: 'missing threadId' };

  updateSessionArtifact(services, threadId as EntityId, (prev) => {
    const isNewSession = !!sessionId && sessionId !== prev.sessionId;
    return {
      sessionId: sessionId || '',
      model: model || '',
      cwd: cwd || '',
      // Reset context tracking when starting a fresh CLI session.
      ...(isNewSession ? { alertedThresholds: [], contextTokens: 0 } : {}),
    };
  });

  return { success: true, sessionId, model };
}
