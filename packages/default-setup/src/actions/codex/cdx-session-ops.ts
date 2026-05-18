/**
 * CDX: Session Ops - handles session-heavy cdx- commands.
 */

import type { ActionMeta, EntityId, Services, Z } from '../../types';
import { ensureSessionMarker, getCodexState, persistCodexState, updateChatState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CDX: Session Ops',
  description: 'Dispatcher for session-heavy cdx- commands.',
  category: 'codex',
  input: {
    command: { type: 'string', description: 'Full command name (e.g. cdx-resume)', required: true },
    text: { type: 'string', description: 'Arguments after the command', required: false },
    threadId: { type: 'string', description: 'Thread ID for response', required: false },
    references: { type: 'object', description: 'Attached references', required: false },
    cwdOverride: { type: 'string', description: 'Optional project directory override', required: false },
  },
};

type CommandResult = { text: string; data?: any; blocks?: any[]; skipMessage?: boolean };
type Handler = (args: string[], services: Services, threadId?: string, cwdOverride?: string) => Promise<CommandResult>;

const SESSION_SOURCE_KINDS = ['cli', 'vscode', 'appServer'];

const handlers: Record<string, Handler> = {
  sessions: handleSessions,
  resume: handleResume,
};

export async function action(
  params: Record<string, any>,
  services: Services,
  _z: Z,
  _flowId: string,
) {
  const { command, text, threadId, cwdOverride } = params;
  const name = (command as string).replace(/^cdx-/, '');
  const args = text?.trim() ? text.trim().split(/\s+/) : [];
  const handler = handlers[name];

  let result: CommandResult;
  if (handler) {
    try {
      result = await handler(args, services, threadId, cwdOverride);
    } catch (error: any) {
      result = { text: `cdx-${name} failed: ${error?.message || 'Unknown error'}` };
    }
  } else {
    result = { text: `Unknown session command: cdx-${name}` };
  }

  if (threadId && !result.skipMessage) {
    services.chat.sendBlockMessage({
      threadId,
      text: result.text,
      blocks: result.blocks ?? [],
    });
  }

  return { success: !!handler, command: `cdx-${name}`, text: result.text, data: result.data };
}

async function ensureServer(services: Services): Promise<any> {
  const codex = services.codex as any;
  if (codex.status !== 'ready') await codex.start();
  return codex;
}

function effectiveCwd(services: Services, threadId?: string, cwdOverride?: string): string | undefined {
  const prior = threadId ? getCodexState(services, threadId) : undefined;
  const codeSettings = services.repository.settingsQueries.getPluginSettings('code') as any;
  return cwdOverride
    || prior?.cwdOverride
    || prior?.cwd
    || codeSettings?.defaultBaseDirectory
    || codeSettings?.lastDirectoryOpened
    || undefined;
}

function formatSessionItem(thread: any) {
  return {
    id: thread.id,
    title: thread.name || thread.preview || `Session ${String(thread.id).slice(0, 8)}`,
    modifiedAt: thread.updatedAt ? new Date(thread.updatedAt * 1000).toISOString() : '',
    size: Array.isArray(thread.turns) ? thread.turns.length : 0,
    cwd: thread.cwd,
  };
}

async function listThreads(services: Services, cwd?: string, limit = 50): Promise<any[]> {
  const codex = await ensureServer(services);
  const response = await codex.listThreads({
    limit,
    sortKey: 'updated_at',
    sortDirection: 'desc',
    sourceKinds: SESSION_SOURCE_KINDS,
    archived: false,
    ...(cwd && { cwd }),
  });
  return response?.data ?? [];
}

function textFromUserContent(content: any): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((item: any) => item?.type === 'text' && item.text)
    .map((item: any) => item.text)
    .join('\n');
}

function importThreadMessages(services: Services, threadId: string, thread: any): number {
  const messages: Array<{
    text: string;
    sender: 'user' | 'assistant';
    forkable?: boolean;
    context?: Record<string, unknown>;
  }> = [];

  for (const turn of thread?.turns ?? []) {
    for (const item of turn?.items ?? []) {
      if (item?.type === 'userMessage') {
        const text = textFromUserContent(item.content);
        if (!text) continue;
        messages.push({
          text,
          sender: 'user',
          forkable: false,
          context: { codexItemId: item.id, codexTurnId: turn.id },
        });
      } else if (item?.type === 'agentMessage' || item?.type === 'plan') {
        const text = item.text || '';
        if (!text) continue;
        messages.push({
          text,
          sender: 'assistant',
          forkable: true,
          context: { codexItemId: item.id, codexTurnId: turn.id },
        });
      }
    }
  }

  if (messages.length > 0) {
    services.chat.addMessagesToThread({
      threadId: threadId as EntityId,
      messages: messages as any,
    });
  }

  return messages.length;
}

async function handleSessions(
  args: string[],
  services: Services,
  threadId?: string,
  cwdOverride?: string,
): Promise<CommandResult> {
  const limit = Number.isFinite(Number(args[0])) ? Math.max(1, Math.min(100, Number(args[0]))) : 50;
  const cwd = effectiveCwd(services, threadId, cwdOverride);
  const threads = await listThreads(services, cwd, limit);

  if (!threads.length) return { text: 'No Codex sessions found.' };

  const items = threads.map(formatSessionItem);
  return {
    text: `${threads.length} Codex sessions`,
    blocks: [{ type: 'session-list', props: { sessions: items } }],
    data: threads,
  };
}

async function handleResume(
  args: string[],
  services: Services,
  threadId?: string,
  cwdOverride?: string,
): Promise<CommandResult> {
  const identifier = args.join(' ').replace(/^["']|["']$/g, '').trim();
  const cwd = effectiveCwd(services, threadId, cwdOverride);

  if (!identifier) {
    const threads = await listThreads(services, cwd, 50);
    if (!threads.length) return { text: 'No Codex sessions found.' };
    return {
      text: 'Pick a Codex session to resume (use `/cdx-resume <thread-id>`):',
      blocks: [{ type: 'session-list', props: { sessions: threads.map(formatSessionItem) } }],
      data: threads,
    };
  }

  if (!threadId) return { text: 'No active thread.' };

  const threads = await listThreads(services, cwd, 100);
  const lower = identifier.toLowerCase();
  const match = threads.find((t: any) => t.id === identifier || t.sessionId === identifier)
    || threads.find((t: any) => String(t.name || '').toLowerCase() === lower)
    || threads.find((t: any) => String(t.preview || '').toLowerCase().startsWith(lower));

  if (!match) return { text: `Codex session not found: ${identifier}` };

  const codex = await ensureServer(services);
  const resumed = await codex.resumeThread(match.id);
  const codexThreadId = resumed.threadId || match.id;
  const title = match.name || match.preview || `Codex ${String(codexThreadId).slice(0, 8)}`;
  const read = await codex.readThread(codexThreadId, { includeTurns: true });

  const existingMessages = services.repository.threadQueries.messages(threadId as EntityId);
  const hasRealMessages = existingMessages?.some((m: any) =>
    m.sender === 'user' && !m.isCommand
  );
  let targetThreadId = threadId;

  if (hasRealMessages) {
    const created = services.chat.createThreadAndNotify({ topic: title, instructions: '' });
    targetThreadId = created.id as string;
  } else {
    services.repository.threadCommands.update(threadId as EntityId, { topic: title });
  }

  const importedCount = importThreadMessages(services, targetThreadId, read?.thread);

  ensureSessionMarker(services, targetThreadId as EntityId);
  persistCodexState(services, targetThreadId, {
    threadId: codexThreadId,
    cwd: read?.thread?.cwd || match.cwd || cwd,
    startedAt: Date.now(),
    chatState: 'idle',
    isRunning: false,
    pendingApproval: undefined,
    queuedMessage: undefined,
    turnId: undefined,
    activeMessageId: undefined,
  });
  updateChatState(services, targetThreadId as EntityId, 'idle');

  const confirmText = `Codex session resumed: **${title}** (${importedCount} messages imported)\nSend a message to continue.`;

  if (hasRealMessages) {
    services.chat.sendBlockMessage({
      threadId: targetThreadId as EntityId,
      text: confirmText,
      blocks: [],
    });
    services.chat.openThreadChatAndRefreshRecent(targetThreadId as EntityId);
    return { text: confirmText, skipMessage: true };
  }

  services.emitter.sendToPlugin('threads', {
    type: 'LOAD_CHAT_THREAD',
    data: services.repository.chatQueries.threadData(targetThreadId as EntityId),
  });

  return { text: confirmText };
}
