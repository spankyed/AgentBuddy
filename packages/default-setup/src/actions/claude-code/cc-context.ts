/**
 * CC: Context — shows context window usage breakdown for the current session.
 */

import type { ActionMeta, Services, Z } from '../../types';
import { getClaudeState } from './_helpers/thread-context';

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

  const handle = await services.cli.claudeCode.query({
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

// ── Context markdown parser ─────────────────────────────────────────

function parseTokenCount(s: string): number {
  const trimmed = s.trim();
  const n = parseFloat(trimmed);
  if (trimmed.endsWith('k') || trimmed.endsWith('K')) return Math.round(n * 1000);
  if (trimmed.endsWith('M') || trimmed.endsWith('m')) return Math.round(n * 1_000_000);
  return Math.round(n);
}

function parseContextMarkdown(md: string): any | null {
  if (!md) return null;

  const modelMatch = md.match(/\*\*Model:\*\*\s*(.+)/);
  const tokensMatch = md.match(/\*\*Tokens:\*\*\s*([\d,.]+[kKmM]?)\s*\/\s*([\d,.]+[kKmM]?)\s*\((\d+)%\)/);
  if (!tokensMatch) return null;

  const categories: Array<{ name: string; tokens: number; percentage: number }> = [];
  const catRegex = /\|\s*([^|]+?)\s*\|\s*([\d,.]+[kKmM]?)\s*\|\s*([\d.]+)%\s*\|/g;
  let m;
  while ((m = catRegex.exec(md)) !== null) {
    const name = m[1].trim();
    if (name === 'Category' || name.startsWith('---')) continue;
    categories.push({ name, tokens: parseTokenCount(m[2]), percentage: parseFloat(m[3]) });
  }

  const memoryFiles = parseDetailSection(md, 'Memory Files', ['type', 'path', 'tokens']);
  const skills = parseDetailSection(md, 'Skills', ['name', 'source', 'tokens']);

  return {
    model: modelMatch?.[1]?.trim() || '',
    totalTokens: parseTokenCount(tokensMatch[1]),
    maxTokens: parseTokenCount(tokensMatch[2]),
    percentage: parseInt(tokensMatch[3]),
    categories,
    memoryFiles: memoryFiles.length ? memoryFiles : undefined,
    skills: skills.length ? skills : undefined,
  };
}

function parseDetailSection(md: string, heading: string, columns: string[]): any[] {
  const sectionRegex = new RegExp(`### ${heading}[\\s\\S]*?(?=###|$)`);
  const section = md.match(sectionRegex)?.[0];
  if (!section) return [];

  const rows: any[] = [];
  const rowRegex = /\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/g;
  let m;
  let skipCount = 0;
  while ((m = rowRegex.exec(section)) !== null) {
    if (skipCount < 2) { skipCount++; continue; }
    const entry: any = {};
    for (let i = 0; i < columns.length; i++) {
      const val = m[i + 1]?.trim() || '';
      entry[columns[i]] = columns[i] === 'tokens' ? parseTokenCount(val) : val;
    }
    rows.push(entry);
  }
  return rows;
}
