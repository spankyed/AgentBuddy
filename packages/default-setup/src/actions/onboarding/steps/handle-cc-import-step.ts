import type { EntityId, Services } from '../../../types';
import { finishOnboarding, type OnboardingState } from '../onboarding-helpers';

/**
 * Start the cc-import step — discovers sessions and asks about project creation.
 * Called after CLI is confirmed working.
 */
export async function startCcImportStep(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
) {
  let sessions: any[] = [];

  try {
    sessions = await services.cli.claudeCode.listAllSessions({ limit: 50 });
  } catch {
    // If listing fails, skip to finish
  }

  if (!sessions.length) {
    services.chat.sendBlockMessage({
      threadId,
      text: 'No existing Claude Code sessions found. No worries — you can import sessions later with `/cc-import`.',
      blocks: [],
      forkable: false,
    });
    finishOnboarding(services, state, threadId);
    return;
  }

  // Extract unique project directories from sessions
  const cwdSet = new Set<string>();
  for (const s of sessions) {
    if (s.cwd) cwdSet.add(s.cwd);
  }
  const projectDirs = Array.from(cwdSet);

  if (projectDirs.length > 0) {
    const choices = projectDirs.map((dir: string) => {
      const name = dir.split('/').filter(Boolean).pop() || dir;
      return { id: dir, label: name, description: dir };
    });

    const { messageId } = services.chat.sendChoiceBlock({
      threadId,
      text: `I found ${projectDirs.length} project director${projectDirs.length === 1 ? 'y' : 'ies'} from your Claude Code sessions. Would you like to add them as projects?`,
      prompt: 'Select projects to add',
      choices,
      multiSelect: true,
      allowCustom: false,
      compact: true,
      forkable: false,
      autoHide: true,
      asUser: true,
    });

    state.step = 'cc-import';
    state.pendingMessageId = messageId;
  } else {
    // No project directories found — skip to finish
    finishOnboarding(services, state, threadId);
  }
}

/**
 * Handle user response from the project directory selection.
 * Creates project settings for selected dirs, then finishes onboarding.
 */
export function handleCcImportStep(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
  response: string | string[],
) {
  const selected = Array.isArray(response) ? response : [response];

  if (selected.length > 0 && selected[0] !== '') {
    // Create project settings for selected directories
    const projectEntries = selected.map((dir: string) => ({
      name: dir.split('/').filter(Boolean).pop() || 'Project',
      directories: [dir],
      color: '#3B82F6',
    }));

    services.repository.settingsCommands.updateSettings('general', 'projects', [], projectEntries);

    services.chat.sendBlockMessage({
      threadId,
      text: `Added ${projectEntries.length} project${projectEntries.length === 1 ? '' : 's'} to your settings.`,
      blocks: [],
      forkable: false,
    });
  }

  // Now run the full import of sessions in the background
  importSessions(services, threadId);

  finishOnboarding(services, state, threadId);
}

/**
 * Import sessions silently during onboarding.
 * Uses the same pattern as cc-session-ops handleImport but simplified.
 */
async function importSessions(services: Services, threadId: EntityId) {
  try {
    const sessions = await services.cli.claudeCode.listAllSessions({ limit: 50 });
    if (!sessions.length) return;

    // Build set of already-imported sessionIds
    const existingSessionIds = new Set<string>();
    for (const thread of services.repository.threadQueries.all()) {
      const sid = (thread as any)?.context?.claudeCode?.sessionId;
      if (sid) existingSessionIds.add(sid);
    }

    const toImport = sessions.filter((s: any) => !existingSessionIds.has(s.id));
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

        // Import messages
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

        // Set session state
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
            sessionId: session.id,
            model: '',
            cwd,
            startedAt: now,
            lastTurnAt: now,
            turns: 0,
            totalCostUsd: 0,
            chatState: 'idle',
            toolCallCount: 0,
            permissionMode: 'default',
          },
          threadId: newThreadId,
        });
      } catch {
        // Skip individual session failures
      }
    }

    // Refresh thread list
    const connectedData = services.repository.threadQueries.connectedData();
    const threadsSettings = services.repository.settingsQueries.getPluginSettings('threads');
    services.emitter.sendToPlugin('threads', {
      type: 'THREAD_CONNECTED',
      data: { ...connectedData, settings: threadsSettings || null },
    });
  } catch {
    // Silently fail — import is best-effort during onboarding
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
