/** Codex Chat — starts a Codex SDK query and kicks off a background stream consumer. */

import type { ActionMeta, Services, Z, EntityId } from '../../types';
import { createStreamWriter } from '../claude-code/_helpers/stream-writer';
import { createToolActivityWriter } from '../claude-code/_helpers/tool-activity-writer';
import { createThinkingWriter } from '../claude-code/_helpers/thinking-writer';
import { getCodexState, persistCodexState, setRunning, enqueueMessage, ensureSessionMarker, updateChatState } from './_helpers/thread-context';
import { consumeStream } from './_helpers/stream-consumer';

export const meta: ActionMeta = {
  label: 'Codex Chat',
  description: 'Drives Codex in streaming mode for the current thread.',
  category: 'codex',
  input: {
    threadId: { type: 'string', description: 'Target thread', required: true },
    text: { type: 'string', description: 'User message text', required: true },
    mode: { type: 'string', description: 'Agent mode', required: false },
    model: { type: 'string', description: 'Override model', required: false },
    messageId: { type: 'string', description: 'User message entity ID', required: false },
  },
};

export async function action(params: Record<string, any>, services: Services, _z: Z, _flowId: string) {
  const { threadId, text, model, messageId: userMessageId, references } = params as {
    threadId: EntityId; text: string; mode?: string; model?: string; messageId?: string; references?: any;
  };

  const log = services.logger;
  if (!threadId || !text?.trim()) return { success: false, error: 'threadId and text are required' };

  const prior = getCodexState(services, threadId);
  const resumeThreadId = prior?.threadId || undefined;

  // Concurrency guard
  if (prior?.isRunning) {
    enqueueMessage(services, threadId, { text, mode: params.mode as string, messageId: userMessageId, references });
    if (userMessageId) services.chat.updateMessageState(userMessageId as any, { status: 'queued' } as any);
    return { success: true, queued: true };
  }

  setRunning(services, threadId, true);
  if (userMessageId) services.chat.updateMessageState(userMessageId as any, { forkable: false } as any);

  // CWD check
  const cwdOverride = params.cwdOverride as string | undefined;
  const forceDirectoryPicker = params.forceDirectoryPicker as boolean | undefined;
  const codeSettings = services.repository.settingsQueries.getPluginSettings('code') as any;
  const hasCwd = codeSettings?.defaultBaseDirectory || codeSettings?.lastDirectoryOpened || prior?.cwd;

  if (forceDirectoryPicker || (!hasCwd && !cwdOverride)) {
    const projects = (services.repository.settingsQueries.getGeneralSettings('projects') as any[]) || [];
    const picker = services.chat.sendBlockMessage({
      threadId, text: 'Which project directory should I work in?',
      blocks: [
        { type: 'prompt', props: { content: 'Select a project directory' } },
        { type: 'project-select', props: { projects } },
        { type: 'file-picker', props: { fileType: 'directory' } },
      ],
      forkable: false, autoHide: true, asUser: true, asideContext: 'Project',
    });
    persistCodexState(services, threadId, {
      pendingDirectorySelect: { pickerMessageId: picker.messageId as string, text, mode: params.mode, model, messageId: userMessageId, references },
    });
    setRunning(services, threadId, false);
    return { success: true, awaitingDirectory: true };
  }

  // Placeholder message + writers
  const currentMessageId = services.chat.sendBlockMessage({ threadId, text: 'Thinking…', blocks: [], forkable: false }).messageId;
  const thinking = createThinkingWriter(services, currentMessageId, { intervalMs: 250 });
  const writer = createStreamWriter(services, currentMessageId, { intervalMs: 80 });
  const toolActivity = createToolActivityWriter(services, currentMessageId, { intervalMs: 250, getThinkingBlock: () => thinking.buildBlock() });

  ensureSessionMarker(services, threadId);
  persistCodexState(services, threadId, { startedAt: prior?.startedAt ?? Date.now(), sessionError: undefined, ...(model && { model }) });
  updateChatState(services, threadId, 'working');

  try {
    const sessionCwd = resumeThreadId
      ? prior?.cwd
      : (cwdOverride || codeSettings?.defaultBaseDirectory || codeSettings?.lastDirectoryOpened || undefined);

    if (sessionCwd && !prior?.cwd) persistCodexState(services, threadId, { cwd: sessionCwd });

    const handle = await (services.codex as any).query({
      prompt: text,
      ...(sessionCwd && { cwd: sessionCwd }),
      ...(resumeThreadId && { threadId: resumeThreadId }),
      ...(model && { model }),
      sandboxMode: 'workspace-write',
      additionalDirectories: prior?.additionalDirs,
    });

    (services.codex as any).storeHandle(threadId, handle);

    consumeStream(handle, { services, threadId, text }, {
      writer, toolActivity, thinking, messageId: currentMessageId as EntityId,
    }).catch((err) => {
      log.error('[codex] consumeStream escaped', { err: err?.message });
      (services.codex as any).clearHandle(threadId);
      setRunning(services, threadId, false);
      updateChatState(services, threadId, 'idle');
    });

    return { success: true, streaming: true };
  } catch (err: any) {
    const message = err?.message || 'Codex query failed to start';
    log.error('[codex] query failed', { message });
    toolActivity.finalise('error');
    setRunning(services, threadId, false);
    updateChatState(services, threadId, 'idle');
    writer.finalize(`⚠️ ${message}`);
    return { success: false, error: message, messageId: currentMessageId };
  }
}
