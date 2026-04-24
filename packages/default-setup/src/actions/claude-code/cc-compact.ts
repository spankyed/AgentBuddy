/**
 * CC: Compact — compacts a Claude Code session's context and creates a marker message.
 */

import type { ActionMeta, Services, Z } from '../../types';
import { getClaudeState, updateChatState, readSessionCwd } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CC: Compact',
  description: 'Compact a Claude Code session context',
  category: 'claude-code',
  input: {
    command: { type: 'string', required: true },
    text: { type: 'string', required: false },
    threadId: { type: 'string', required: false },
    references: { type: 'object', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  _z: Z,
  _flowId: string,
) {
  const { text, threadId } = params;
  const args = text?.trim() ? text.trim().split(/\s+/) : [];

  let result: { text: string; data?: any; skipMessage?: boolean };

  try {
    result = await handleCompact(args, services, threadId);
  } catch (error: any) {
    result = { text: `cc-compact failed: ${error?.message || 'Unknown error'}` };
  }

  if (threadId && !result.skipMessage) {
    services.chat.sendBlockMessage({ threadId, text: result.text, blocks: [] });
  }

  return { success: true, command: 'cc-compact', text: result.text };
}

async function handleCompact(
  args: string[],
  services: Services,
  threadId?: string,
): Promise<{ text: string; data?: any; skipMessage?: boolean }> {
  if (!threadId) return { text: 'No active thread — run a Claude Code turn first.' };

  const sessionId = getClaudeState(services, threadId)?.sessionId;
  if (!sessionId) return { text: 'No active session — run a Claude Code turn first.' };

  updateChatState(services, threadId as any, 'working');
  try {
    const sessionCwd = readSessionCwd(services, threadId as any);
    const prompt = args.length > 0 ? `/compact ${args.join(' ')}` : '/compact';
    const handle = await services.cli.claudeCode.query({
      ...(sessionCwd && { cwd: sessionCwd }),
      prompt,
      resume: sessionId,
      permissionMode: 'plan',
    });

    const result = await handle.result;
    const summaryText = result.text || 'Session compacted.';

    const { compactedMessageIds } = services.chat.createMarkerMessage({
      threadId: threadId as any,
      text: summaryText,
    });

    return { text: summaryText, skipMessage: compactedMessageIds.length > 0 };
  } finally {
    updateChatState(services, threadId as any, 'idle');
  }
}
