/**
 * CDX: Stream Started — updates thread context with Codex thread details
 * when the stream consumer receives the first `thread.started` event.
 *
 * Triggered by the `cdx.stream.started` brain event.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { updateCodexState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CDX: Stream Started',
  description: 'Updates thread context with Codex session details when streaming begins.',
  category: 'codex',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    codexThreadId: { type: 'string', description: 'Codex SDK thread ID', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, codexThreadId } = params as {
    threadId: string;
    codexThreadId?: string;
  };

  if (!threadId) return { success: false, reason: 'missing threadId' };

  updateCodexState(services, threadId as EntityId, {
    threadId: codexThreadId || '',
  });

  return { success: true, codexThreadId };
}
