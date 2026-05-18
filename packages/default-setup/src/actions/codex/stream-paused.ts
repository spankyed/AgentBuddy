/**
 * CDX: Stream Paused — stub for Phase 2 approval flow.
 *
 * In Phase 1, Codex runs with sandboxMode: "workspace-write" and no
 * interactive approval. This action is a placeholder that will be wired
 * up when the integration migrates to the Codex app-server JSON-RPC
 * protocol with ApprovalsReviewer: "user".
 */

import type { ActionMeta, Services } from '../../types';

export const meta: ActionMeta = {
  label: 'CDX: Stream Paused',
  description: 'Placeholder for Codex approval flow (Phase 2).',
  category: 'codex',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId } = params as { threadId: string };

  if (!threadId) return { success: false, reason: 'missing threadId' };

  services.logger.debug('[codex] stream paused — Phase 2 stub', { threadId });

  return { success: true, noop: true };
}
