/**
 * Codex Chat — starts/resumes a thread on the app-server and begins a turn.
 *
 * Registers a callback-based stream consumer, then calls startTurn.
 * The action returns immediately; notifications stream via callbacks.
 */

import type { ActionMeta, Services, Z, EntityId } from '../../types';
import { createStreamWriter } from '../claude-code/_helpers/stream-writer';
import { createToolActivityWriter } from '../claude-code/_helpers/tool-activity-writer';
import { createThinkingWriter } from '../claude-code/_helpers/thinking-writer';
import {
  getCodexState, persistCodexState, setRunning, enqueueMessage,
  killTurn, ensureSessionMarker, updateChatState,
} from './_helpers/thread-context';
import { createStreamConsumer } from './_helpers/stream-consumer';

export const meta: ActionMeta = {
  label: 'Codex Chat',
  description: 'Drives Codex via app-server for the current thread.',
  category: 'codex',
  input: {
    threadId: { type: 'string', description: 'Target thread', required: true },
    text: { type: 'string', description: 'User message text', required: true },
    mode: { type: 'string', required: false },
    phase: { type: 'string', description: 'plan or edit', required: false },
    model: { type: 'string', required: false },
    messageId: { type: 'string', required: false },
  },
};

export async function action(params: Record<string, any>, services: Services, _z: Z, _flowId: string) {
  const { threadId, text, phase, model, messageId: userMessageId, references } = params as {
    threadId: EntityId; text: string; mode?: string; phase?: string; model?: string; messageId?: string; references?: any;
  };

  const log = services.logger;
  if (!threadId || !text?.trim()) return { success: false, error: 'threadId and text are required' };

  const prior = getCodexState(services, threadId);
  const codexThreadId = prior?.threadId;
  const effectiveModel = model || prior?.model;
  const approvalMode = prior?.approvalMode ?? 'user';
  const sandbox = prior?.sandbox ?? 'workspace-write';

  // ─── Concurrency guard ──────────────────────────────────────────────
  if (prior?.isRunning) {
    enqueueMessage(services, threadId, { text, mode: params.mode as string, phase, messageId: userMessageId, references });
    if (userMessageId) services.chat.updateMessageState(userMessageId as any, { status: 'queued' } as any);
    return { success: true, queued: true };
  }

  // Kill paused turn if pending approval
  if (prior?.pendingApproval) {
    killTurn(services, threadId);
  }

  setRunning(services, threadId, true);
  if (userMessageId) services.chat.updateMessageState(userMessageId as any, { forkable: false } as any);

  // ─── CWD check ──────────────────────────────────────────────────────
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
      pendingDirectorySelect: { pickerMessageId: picker.messageId as string, text, mode: params.mode, phase, model: effectiveModel, messageId: userMessageId, references },
    });
    setRunning(services, threadId, false);
    return { success: true, awaitingDirectory: true };
  }

  // ─── Placeholder message + writers ──────────────────────────────────
  const currentMessageId = services.chat.sendBlockMessage({ threadId, text: 'Thinking…', blocks: [], forkable: false }).messageId;
  const thinking = createThinkingWriter(services, currentMessageId, { intervalMs: 250 });
  const writer = createStreamWriter(services, currentMessageId, { intervalMs: 80 });
  const toolActivity = createToolActivityWriter(services, currentMessageId, { intervalMs: 250, getThinkingBlock: () => thinking.buildBlock() });

  ensureSessionMarker(services, threadId);
  persistCodexState(services, threadId, { startedAt: prior?.startedAt ?? Date.now(), sessionError: undefined, ...(effectiveModel && { model: effectiveModel }) });
  persistCodexState(services, threadId, { activeMessageId: currentMessageId as string });
  updateChatState(services, threadId, 'working');

  const codex = services.codex as any;
  let activeThreadId: string | undefined;

  try {
    // Ensure app-server is running
    if (codex.status !== 'ready') {
      await codex.start();
    }

    // Resolve CWD
    const sessionCwd = codexThreadId
      ? prior?.cwd
      : (cwdOverride || codeSettings?.defaultBaseDirectory || codeSettings?.lastDirectoryOpened || undefined);

    if (sessionCwd && !prior?.cwd) persistCodexState(services, threadId, { cwd: sessionCwd });
    if (codexThreadId) {
      const result = await codex.resumeThread(codexThreadId, {
        ...(effectiveModel && { model: effectiveModel }),
        approvalsReviewer: approvalMode,
        sandbox,
      });
      activeThreadId = result.threadId;
    } else {
      const result = await codex.startThread({
        cwd: sessionCwd,
        model: effectiveModel,
        sandbox,
        approvalsReviewer: approvalMode,
      });
      activeThreadId = result.threadId;
      persistCodexState(services, threadId, { threadId: activeThreadId, cwd: result.cwd || sessionCwd, approvalMode, sandbox });
    }

    // Create stream consumer + register
    const { handlers } = createStreamConsumer(
      { services, threadId, codexThreadId: activeThreadId, text, phase },
      { writer, toolActivity, thinking, messageId: currentMessageId as EntityId },
    );
    codex.registerConsumer(activeThreadId, handlers);

    // Map collaboration mode from phase
    const collaborationMode = phase === 'plan'
      ? { mode: 'plan' as const, settings: { model: effectiveModel || 'gpt-5.5', developer_instructions: null } }
      : undefined;

    // Start turn
    const turnResult = await codex.startTurn({
      threadId: activeThreadId,
      input: [{ type: 'text', text }],
      ...(sessionCwd && { cwd: sessionCwd }),
      ...(effectiveModel && { model: effectiveModel }),
      ...(collaborationMode && { collaborationMode }),
      approvalsReviewer: approvalMode,
    });

    // Store handle for pause/abort
    const turnId = turnResult.turnId;
    persistCodexState(services, threadId, { turnId, activeMessageId: currentMessageId as string });
    codex.storeHandle(threadId, {
      codexThreadId: activeThreadId,
      turnId,
      abort: () => codex.interruptTurn(activeThreadId, turnId),
    });

    return { success: true, streaming: true };
  } catch (err: any) {
    const message = err?.message || 'Codex query failed to start';
    log.error('[codex] chat failed', { message, stack: err?.stack });
    // Clean up consumer if it was registered
    if (activeThreadId) {
      try { codex.unregisterConsumer(activeThreadId); } catch { /* may not exist */ }
    }
    toolActivity.finalise('error');
    setRunning(services, threadId, false);
    updateChatState(services, threadId, 'idle');
    writer.finalize(`⚠️ ${message}`);
    return { success: false, error: message, messageId: currentMessageId };
  }
}
