/**
 * CC: Update Permission Mode — persists the user's permission mode choice
 * to thread context and auto-approves any pending control request when
 * switching to bypass mode.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getClaudeState, persistClaudeState, updateChatState } from './_helpers/thread-context';
import { DONT_BYPASS } from './_helpers/auto-approve';

export const meta: ActionMeta = {
  label: 'CC: Update Permission Mode',
  description: 'Persists the permission mode toggle and auto-approves pending requests on bypass.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Thread ID', required: true },
    mode: { type: 'string', description: 'Permission mode to set', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { threadId, mode } = params as { threadId: string; mode: string };
  if (!threadId || !mode) return { success: false, reason: 'missing threadId or mode' };

  const prior = getClaudeState(services, threadId);
  if (!prior) return { success: false, reason: 'no claude state on thread' };

  const updates: Record<string, unknown> = { permissionMode: mode };

  // If switching to bypass and there's a paused control request, auto-approve it.
  if (mode === 'bypassPermissions') {
    const pending = prior.pendingControlRequest;
    if (pending?.requestId && !DONT_BYPASS.has(pending.toolName)) {
      const handle = (services.cli as any).claudeCode.getHandle(threadId);
      if (handle) {
        handle.respond(pending.requestId, {
          behavior: 'allow',
          updatedInput: pending.originalInput ?? {},
        });
        services.chat.updateMessageState(pending.approvalMessageId as any, {
          responseTimestamp: Date.now(),
          blockResponse: { approved: true },
        } as any);
        updates.pendingControlRequest = undefined;
        updates.isRunning = true;
      }
    }
  }

  persistClaudeState(services, threadId, updates as any);

  // If bypass auto-approved a paused turn, transition chat state immediately.
  if (updates.isRunning) {
    updateChatState(services, threadId as EntityId, 'working');
  }

  return { success: true };
}
