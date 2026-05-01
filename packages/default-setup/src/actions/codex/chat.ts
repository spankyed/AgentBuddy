/**
 * Codex Chat — the main conversational action.
 *
 * Checks auth, handles concurrency, shows CWD picker, and kicks off the
 * fire-and-forget stream consumer. Pattern mirrors claude-code/chat.ts.
 */

import type { ActionMeta, Services, Z, EntityId } from '../../types';
import { createStreamWriter } from '../claude-code/_helpers/stream-writer';
import { createToolActivityWriter } from '../claude-code/_helpers/tool-activity-writer';
import {
  getCodexState,
  persistCodexState,
  setRunning,
  enqueueMessage,
  killTurn,
  updateChatState,
  DEFAULT_MODEL,
} from './_helpers/thread-context';
import { consumeStream } from './_helpers/stream-consumer';

export const meta: ActionMeta = {
  label: 'Codex Chat',
  description: 'Drives Codex (OpenAI) in streaming mode for the current thread.',
  category: 'codex',
  input: {
    threadId: { type: 'string', description: 'Target thread', required: true },
    text: { type: 'string', description: 'User message text', required: true },
    mode: { type: 'string', description: 'Agent mode', required: false },
    phase: { type: 'string', description: 'Sub-phase', required: false },
    model: { type: 'string', description: 'Override model', required: false },
    messageId: { type: 'string', description: 'User message entity ID', required: false },
    references: { type: 'object', description: 'Attached references', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  _z: Z,
  _flowId: string,
) {
  const {
    threadId,
    text,
    phase,
    model,
    messageId: userMessageId,
    references,
  } = params as {
    threadId: EntityId;
    text: string;
    mode?: string;
    phase?: string;
    model?: string;
    messageId?: string;
    references?: any;
  };

  const log = services.logger;

  if (!threadId || !text?.trim()) {
    return { success: false, error: 'threadId and text are required' };
  }

  const prior = getCodexState(services, threadId);

  // ─── Auth check ─────────────────────────────────────────────────────
  const authStatus = (services.cli as any).codex.getAuthStatus();
  if (!authStatus.authenticated) {
    // Send a login prompt message
    services.chat.sendBlockMessage({
      threadId,
      text: 'Not authenticated with Codex. Please log in first.',
      blocks: [],
      forkable: false,
    });
    return { success: false, error: 'Not authenticated' };
  }

  // ─── Concurrency guard ──────────────────────────────────────────────
  if (prior?.isRunning) {
    log.debug('action already running — queuing message', { threadId });
    enqueueMessage(services, threadId, { text, mode: params.mode as string, phase, messageId: userMessageId, references });
    if (userMessageId) {
      services.chat.updateMessageState(userMessageId as any, { status: 'queued' } as any);
    }
    return { success: true, queued: true };
  }

  if (prior?.pendingToolCall) {
    log.info('killing paused turn', { threadId });
    killTurn(services, threadId);
  }

  setRunning(services, threadId, true);

  // ─── CWD check ──────────────────────────────────────────────────────
  const codeSettings = services.repository.settingsQueries.getPluginSettings('code') as any;
  const hasCwd = codeSettings?.defaultBaseDirectory || codeSettings?.lastDirectoryOpened || prior?.cwd;
  if (!hasCwd) {
    const projects = (services.repository.settingsQueries.getGeneralSettings('projects') as any[]) || [];
    const picker = services.chat.sendBlockMessage({
      threadId,
      text: 'Which project directory should I work in?',
      blocks: [
        { type: 'prompt', props: { content: 'Select a project directory' } },
        { type: 'project-select', props: { projects } },
        { type: 'file-picker', props: { fileType: 'directory' } },
      ],
      forkable: false,
      autoHide: true,
      asUser: true,
      asideContext: 'Project',
    } as any);
    persistCodexState(services, threadId, {
      pendingDirectorySelect: {
        pickerMessageId: picker.messageId as string,
        text,
        mode: params.mode,
        phase,
        model,
        messageId: userMessageId,
        references,
      },
    });
    setRunning(services, threadId, false);
    return { success: true, awaitingDirectory: true };
  }

  // ─── Set CWD ────────────────────────────────────────────────────────
  const cwd = prior?.cwd || codeSettings?.defaultBaseDirectory || codeSettings?.lastDirectoryOpened || '';
  const selectedModel = model || prior?.model || DEFAULT_MODEL;

  // ─── Create placeholder message ─────────────────────────────────────
  const currentMessageId = services.chat.sendBlockMessage({
    threadId,
    text: 'Thinking…',
    blocks: [],
    forkable: false,
  }).messageId;

  const writer = createStreamWriter(services, currentMessageId as EntityId, { intervalMs: 80 });
  const toolActivity = createToolActivityWriter(services, currentMessageId as EntityId, { intervalMs: 250, phase });

  // Persist initial state
  persistCodexState(services, threadId, {
    startedAt: prior?.startedAt ?? Date.now(),
    cwd,
    model: selectedModel,
  });
  updateChatState(services, threadId, 'working');

  // ─── Add user message to conversation history ───────────────────────
  const history = prior?.conversationHistory || [];
  history.push({ role: 'user', content: text });
  persistCodexState(services, threadId, { conversationHistory: history });

  // ─── Fire the stream consumer ───────────────────────────────────────
  consumeStream(
    { services, threadId: threadId as EntityId, text, phase, userMessageId },
    { writer, toolActivity, messageId: currentMessageId as EntityId },
  ).catch((err) => {
    log.error('consumeStream escaped error boundary', { err: err?.message });
    setRunning(services, threadId, false);
    updateChatState(services, threadId, 'idle');
  });

  return { success: true, streaming: true };
}
