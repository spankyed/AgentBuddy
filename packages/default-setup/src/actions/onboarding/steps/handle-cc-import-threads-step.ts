import type { ActionMeta, EntityId, Services } from '../../../types';
import { getOnboardingState, persistOnboardingState, finishOnboarding } from '../onboarding-helpers';

export const meta: ActionMeta = {
  label: 'Handle CC Import Threads Step',
  description: 'Imports Claude Code sessions as threads if user opted in',
  category: 'onboarding',
  input: {
    threadId: { type: 'string', required: true },
    response: { type: 'any', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const threadId = params.threadId as EntityId;
  const response = typeof params.response === 'string' ? params.response : '';
  const state = getOnboardingState(services, threadId);
  if (!state) return { success: false, reason: 'no-state' };

  if (response === 'yes') {
    services.threads.updateChatState(threadId, 'working');
    await importSessions(services);
    services.threads.updateChatState(threadId, 'idle');
  }

  finishOnboarding(services, state, threadId);
  persistOnboardingState(services, threadId, state);
  return { success: true, step: state.step };
}

async function importSessions(services: Services) {
  try {
    // Only import sessions for user-selected project directories
    const projects = services.repository.settingsQueries.getSettings().general.projects ?? [];
    const selectedDirs = new Set((projects as any[]).flatMap((p: any) => p.directories ?? []));
    if (!selectedDirs.size) return;

    const sessions = await services.cli.claudeCode.listAllSessions({ limit: 50 });
    if (!sessions.length) return;

    const existingSessionIds = new Set<string>();
    for (const thread of services.repository.threadQueries.all()) {
      const sid = (thread as any)?.context?.claudeCode?.sessionId;
      if (sid) existingSessionIds.add(sid);
    }

    const toImport = sessions
      .filter((s: any) => s.cwd && selectedDirs.has(s.cwd))
      .filter((s: any) => !existingSessionIds.has(s.id));
    if (!toImport.length) return;

    for (const session of toImport) {
      try {
        const transcript = (session as any).file
          ? await services.cli.claudeCode.viewSessionByFile((session as any).file)
          : await services.cli.claudeCode.viewSession(session.id, { cwd: (session as any).cwd });

        const cwd = (session as any).cwd || '';
        const segments = cwd.split('/').filter(Boolean);
        const dirName = segments[segments.length - 1];
        const prefix = dirName ? `[${dirName}] ` : '';
        const sessionTitle = (session as any).title || `Session ${session.id.slice(0, 8)}`;

        const { id: newThreadId } = services.repository.threadCommands.create({
          topic: `${prefix}${sessionTitle}`,
          instructions: '',
          tags: ['imported'],
        });

        const messages: Array<{ text: string; sender: 'user' | 'assistant'; forkable?: boolean; context?: Record<string, unknown> }> = [];
        for (const entry of transcript) {
          const msg = (entry as any).message;
          const uuid = (entry as any).uuid;
          if ((entry as any).type === 'user' && msg?.role === 'user') {
            const text = extractText(msg.content);
            if (!text) continue;
            messages.push({ text, sender: 'user', forkable: false, ...(uuid && { context: { cliUuid: uuid } }) });
          } else if ((entry as any).type === 'assistant') {
            const text = extractText(msg?.content) || '(tool use only)';
            messages.push({ text, sender: 'assistant', forkable: true, ...(uuid && { context: { cliUuid: uuid } }) });
          }
        }

        if (messages.length > 0) {
          services.chat.addMessagesToThread({ threadId: newThreadId as any, messages: messages as any });
        }

        const thread = services.repository.threadQueries.byId(newThreadId) as any;
        services.repository.threadCommands.update(newThreadId, {
          context: { ...(thread?.context || {}), claudeCode: { sessionId: session.id } },
          tags: [...(thread?.tags || ['imported']), 'claude-code'],
        });

        const now = Date.now();
        services.repository.chatCommands.createArtifact({
          artifactType: 'claude-session' as any,
          title: 'Claude Code session',
          content: {
            sessionId: session.id, model: '', cwd,
            startedAt: now, lastTurnAt: now, turns: 0,
            totalCostUsd: 0, chatState: 'idle',
            toolCallCount: 0, permissionMode: 'default',
          },
          threadId: newThreadId,
        });
      } catch {
        // Skip individual session failures
      }
    }

    // Lightweight refresh — don't send full connectedData (all threads + messages)
    // which would crash with hundreds of imported threads. The full list loads
    // when the user navigates to the thread manager.
    services.chat.sendRecentThreadsRefresh();
  } catch {
    // Best-effort
  }
}

function extractText(content: any): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b: any) => b.type === 'text' && b.text)
    .map((b: any) => b.text)
    .join('\n');
}
