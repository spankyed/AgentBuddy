/**
 * CC: Context — shows context window usage breakdown for the current session.
 */

import type { ActionMeta, Services, Z } from '../../types';
import { getClaudeState } from './_helpers/thread-context';
import { readSessionCwd } from './_helpers/session-artifact';
import { parseContextMarkdown } from './_helpers/context-parser';

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

  let result: { text: string; data?: any; blocks?: any[] };

  try {
    result = await handleContext(services, threadId);
  } catch (error: any) {
    result = { text: `cc-context failed: ${error?.message || 'Unknown error'}` };
  }

  if (threadId) {
    services.chat.sendBlockMessage({
      threadId,
      text: result.text,
      blocks: result.blocks ?? [],
    });
  }

  return { success: true, command: 'cc-context', text: result.text, data: result.data };
}

// ── Handler ─────────────────────────────────────────────────────────

async function handleContext(
  services: Services,
  threadId?: string,
): Promise<{ text: string; data?: any; blocks?: any[] }> {
  if (!threadId) return { text: 'No active thread — run a Claude Code turn first.' };

  const sessionId = getClaudeState(services, threadId)?.sessionId;
  if (!sessionId) return { text: 'No active session — run a Claude Code turn first.' };

  const sessionCwd = readSessionCwd(services, threadId as any);

  const handle = await services.cli.claudeCode.query({
    ...(sessionCwd && { cwd: sessionCwd }),
    prompt: '/context',
    resume: sessionId,
    maxTurns: 1,
    permissionMode: 'plan',
    noSessionPersistence: true,
  });

  const result = await handle.result;
  const md = result.text || '';
  const parsed = parseContextMarkdown(md);

  if (parsed) {
    return {
      text: 'Context usage',
      blocks: [{ type: 'context-usage', props: { data: parsed } }],
      data: parsed,
    };
  }

  return { text: md || '(no context data)' };
}
