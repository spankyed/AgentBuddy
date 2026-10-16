/**
 * CC: Context — shows context window usage breakdown for the current session.
 */

import type { ActionMeta } from '@apackdev/sdk/build';
import type { Services, Z } from '#generated/services.ts';
import { getClaudeState } from './_helpers/thread-context.ts';
import { readThreadContextUsage } from './_helpers/context-usage.ts';

export const meta: ActionMeta = {
  label: 'CC: Context',
  description: 'Show context window usage breakdown',
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
  const { threadId } = params;

  let failed = false;
  let result: { text: string; data?: any; blocks?: any[] };

  try {
    if (params.text?.trim() && params.text.trim() !== 'start') result = { text: 'Usage: cc-context [start]' };
    else result = await handleContext(services, threadId, params.text?.trim() === 'start');
  } catch (error: any) {
    failed = true;
    result = { text: `cc-context failed: ${error?.message || 'Unknown error'}` };
  }

  if (threadId) {
    services.chat.sendBlockMessage({
      threadId,
      text: result.text,
      blocks: result.blocks ?? [],
    });
  }

  return { success: !failed, command: 'cc-context', text: result.text, data: result.data };
}

// ── Handler ─────────────────────────────────────────────────────────

async function handleContext(
  services: Services,
  threadId?: string,
  start = false,
): Promise<{ text: string; data?: any; blocks?: any[] }> {
  if (!threadId) return { text: 'No active thread — run a Claude Code turn first.' };

  const ccState = getClaudeState(services, threadId);
  const usage = await readThreadContextUsage(services, threadId, {
    sessionId: ccState?.sessionId, cwd: ccState?.cwd,
  }, { start });
  if (!usage) return { text: ccState?.sessionId
    ? 'No native conversation is running. Use cc-context start to read saved context with a temporary native process. Starting and closing it can run configured session hooks.'
    : 'No active session — run a Claude Code turn first.' };
  return {
    text: 'Context usage',
    blocks: [{ type: 'context-usage', props: { data: usage } }],
    data: usage,
  };
}
