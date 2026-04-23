import type { ActionMeta, EntityId, Services } from '../../../types';
import { getOnboardingState, persistOnboardingState, finishOnboarding, flashSuccess } from '../onboarding-helpers';

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
    flashSuccess(services, threadId, 'paused');
  } else {
    flashSuccess(services, threadId, 'paused');
  }

  // Show recent imported threads to continue, or finish
  const allThreads = services.repository.threadQueries.all();
  const recentThreads = allThreads
    .filter((t: any) => t.tags?.includes('claude-code') && t.id !== threadId)
    .sort((a: any, b: any) => {
      const aTime = a.lastMessageTimestamp || a.timestamp;
      const bTime = b.lastMessageTimestamp || b.timestamp;
      return bTime - aTime;
    })
    .slice(0, 7);

  if (recentThreads.length > 0) {
    const choices = [
      ...recentThreads.map((t: any) => ({
        id: t.id,
        label: t.topic || 'Untitled',
      })),
      { id: 'skip', label: 'Skip', description: "Start fresh" },
    ];

    const { messageId } = services.chat.sendChoiceBlock({
      threadId,
      text: "Here are your most recent threads. Want to continue where you left off?",
      prompt: 'Pick a thread to continue',
      choices,
      allowCustom: false,
      compact: true,
      forkable: false,
      autoHide: true,
      asUser: true,
    });

    state.step = 'pick-thread';
    state.pendingMessageId = messageId;
  } else {
    finishOnboarding(services, state, threadId);
  }

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

    // Read all transcripts in parallel (bounded concurrency to avoid fd exhaustion)
    const CONCURRENCY = 8;
    const loaded: Array<{ session: any; transcript: any[] }> = [];
    for (let i = 0; i < toImport.length; i += CONCURRENCY) {
      const batch = toImport.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (session: any) => {
          try {
            const transcript = session.file
              ? await services.cli.claudeCode.viewSessionByFile(session.file)
              : await services.cli.claudeCode.viewSession(session.id, { cwd: session.cwd });
            return { session, transcript };
          } catch {
            return null;
          }
        })
      );
      for (const r of results) { if (r) loaded.push(r); }
    }

    // Write threads sequentially (LMDB writes are synchronous)
    for (const { session, transcript } of loaded) {
      try {
        const cwd = session.cwd || '';
        const segments = cwd.split('/').filter(Boolean);
        const dirName = segments[segments.length - 1];
        const prefix = dirName ? `[${dirName}] ` : '';
        // Title: session title > first user message with text (truncated) > session ID
        let sessionTitle = session.title;
        if (!sessionTitle) {
          for (const e of transcript) {
            if ((e as any).type === 'user' && (e as any).message?.role === 'user') {
              const text = extractText((e as any).message.content);
              if (text) { sessionTitle = text.slice(0, 60); break; }
            }
          }
          if (!sessionTitle) sessionTitle = `Session ${session.id.slice(0, 8)}`;
        }

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
          context: { ...(thread?.context || {}), claudeCode: { sessionId: session.id, cwd: cwd || undefined } },
          tags: [...(thread?.tags || ['imported']), 'claude-code'],
        });

        const now = Date.now();
        services.repository.chatCommands.createArtifact({
          artifactType: 'claude-session',
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
        // Skip individual write failures
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
