/**
 * Codex Chat — the main conversational action.
 *
 * Starts a Codex SDK query, stores the handle, and kicks off a
 * fire-and-forget stream consumer that processes events in the background.
 * The action returns immediately so the brain's step actor is not blocked.
 *
 * Triggered from the "Codex" flow when a user.message arrives with
 * `mode === 'codex'`.
 */

import type { ActionMeta, Services, Z, EntityId } from '../../types';
import { createStreamWriter } from '../claude-code/_helpers/stream-writer';
import { createToolActivityWriter } from '../claude-code/_helpers/tool-activity-writer';
import { createThinkingWriter } from '../claude-code/_helpers/thinking-writer';
import {
  getCodexState,
  persistCodexState,
  setRunning,
  enqueueMessage,
  killTurn,
  ensureSessionMarker,
  updateChatState,
} from './_helpers/thread-context';
import { consumeStream } from './_helpers/stream-consumer';

export const meta: ActionMeta = {
  label: 'Codex Chat',
  description: 'Drives Codex in streaming mode for the current thread, resuming prior sessions.',
  category: 'codex',
  input: {
    threadId: { type: 'string', description: 'Target thread', required: true },
    text: { type: 'string', description: 'User message text', required: true },
    mode: { type: 'string', description: 'Agent mode (passed through from user.message)', required: false },
    model: { type: 'string', description: 'Override model', required: false },
    messageId: { type: 'string', description: 'User message entity ID (for queued-state UI)', required: false },
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
    model,
    messageId: userMessageId,
    references,
  } = params as {
    threadId: EntityId;
    text: string;
    mode?: string;
    model?: string;
    messageId?: string;
    references?: any;
  };

  const log = services.logger;
  log.debug('[codex] chat action invoked', { threadId, mode: params.mode, textLen: text?.length });

  if (!threadId || !text?.trim()) {
    return { success: false, error: 'threadId and text are required' };
  }

  // Resume any prior conversation parked on this thread.
  const prior = getCodexState(services, threadId);
  const resumeThreadId = prior?.threadId || undefined;

  // ─── Concurrency guard ──────────────────────────────────────────────
  if (prior?.isRunning) {
    log.debug('[codex] action already running — queuing message', { threadId });
    enqueueMessage(services, threadId, { text, mode: params.mode as string, messageId: userMessageId, references });
    if (userMessageId) {
      services.chat.updateMessageState(userMessageId as any, { status: 'queued' } as any);
    }
    return { success: true, queued: true };
  }

  // Mark this thread as having an active turn.
  setRunning(services, threadId, true);

  // Disable fork on user messages.
  if (userMessageId) {
    services.chat.updateMessageState(userMessageId as any, { forkable: false } as any);
  }

  // ─── CWD check — prompt for directory if none configured ────────────
  const cwdOverride = params.cwdOverride as string | undefined;
  const forceDirectoryPicker = params.forceDirectoryPicker as boolean | undefined;

  const codeSettings = services.repository.settingsQueries.getPluginSettings('code') as any;
  const hasCwd = codeSettings?.defaultBaseDirectory || codeSettings?.lastDirectoryOpened || prior?.cwd;
  if (forceDirectoryPicker || (!hasCwd && !cwdOverride)) {
    const projects = (services.repository.settingsQueries.getGeneralSettings('projects') as any[]) || [];
    const blocks: any[] = [
      { type: 'prompt', props: { content: 'Select a project directory' } },
    ];
    blocks.push({
      type: 'project-select',
      props: { projects },
    });
    blocks.push(
      { type: 'file-picker', props: { fileType: 'directory' } },
    );
    const picker = services.chat.sendBlockMessage({
      threadId,
      text: 'Which project directory should I work in?',
      blocks,
      forkable: false,
      autoHide: true,
      asUser: true,
      asideContext: 'Project',
    });
    persistCodexState(services, threadId, {
      // Store the directory picker state so the response can be routed
      // (reuse pendingDirectorySelect-like pattern at thread context level)
    } as any);
    setRunning(services, threadId, false);
    return { success: true, awaitingDirectory: true };
  }

  // Create the placeholder assistant message we'll stream into.
  const currentMessageId = services.chat.sendBlockMessage({
    threadId,
    text: 'Thinking…',
    blocks: [],
    forkable: false,
  }).messageId;
  log.debug('[codex] placeholder message created', { messageId: currentMessageId });

  const thinking = createThinkingWriter(services, currentMessageId, { intervalMs: 250 });
  const writer = createStreamWriter(services, currentMessageId, { intervalMs: 80 });
  const toolActivity = createToolActivityWriter(services, currentMessageId, { intervalMs: 250, getThinkingBlock: () => thinking.buildBlock() });

  // Upsert the thread's codex-session artifact (type marker only).
  ensureSessionMarker(services, threadId);
  persistCodexState(services, threadId, { startedAt: prior?.startedAt ?? Date.now(), sessionError: undefined });
  updateChatState(services, threadId, 'working');

  // ─── Fire the query ─────────────────────────────────────────────────
  try {
    // Resolve CWD: resume uses stored cwd, new sessions use cwdOverride or settings.
    const sessionCwd = resumeThreadId
      ? prior?.cwd
      : (cwdOverride || codeSettings?.defaultBaseDirectory || codeSettings?.lastDirectoryOpened || undefined);

    // Eager persist CWD before the query fires.
    if (sessionCwd && !prior?.cwd) {
      persistCodexState(services, threadId, { cwd: sessionCwd });
    }

    const handle = await (services.codex as any).query({
      prompt: text,
      ...(sessionCwd && { cwd: sessionCwd }),
      ...(resumeThreadId && { threadId: resumeThreadId }),
      ...(model && { model }),
      sandboxMode: 'workspace-write',
      additionalDirectories: prior?.additionalDirs,
    });

    // Store the handle so other actions (pause-turn) can abort.
    (services.codex as any).storeHandle(threadId, handle);

    log.debug('[codex] query handle received, kicking off stream consumer');

    // Fire-and-forget: the stream consumer runs in the background.
    consumeStream(handle, {
      services, threadId, text,
    }, {
      writer, toolActivity, thinking, messageId: currentMessageId as EntityId,
    }).catch((err) => {
      log.error('[codex] consumeStream escaped error boundary', { err: err?.message });
      (services.codex as any).clearHandle(threadId);
      setRunning(services, threadId, false);
      updateChatState(services, threadId, 'idle');
      services.emitter.sendToPlugin('threads', {
        type: 'FLASH_CHAT_STATE', threadId, stateId: 'error', durationMs: 3000,
      });
    });

    return { success: true, streaming: true };
  } catch (err: any) {
    const message = err?.message || 'Codex query failed to start';
    log.error('[codex] chat action failed to start query', { message, stack: err?.stack });
    toolActivity.finalise('error');
    setRunning(services, threadId, false);
    updateChatState(services, threadId, 'idle');
    services.emitter.sendToPlugin('threads', {
      type: 'FLASH_CHAT_STATE', threadId, stateId: 'error', durationMs: 3000,
    });
    writer.finalize(`⚠️ ${message}`);
    return { success: false, error: message, messageId: currentMessageId };
  }
}
