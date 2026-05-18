/** Helpers for reading/writing `thread.context.codex`. */

import type { Services, EntityId } from '../../../types';

export type ChatState = 'idle' | 'working' | 'paused' | 'error' | 'success';

export interface QueuedMessage {
  text: string;
  mode?: string;
  messageId?: string;
  references?: any;
}

export interface CodexThreadState {
  threadId?: string;
  lastTurnAt?: number;
  cwd?: string;
  model?: string;
  startedAt?: number;
  turns?: number;
  totalTokens?: { input: number; output: number; reasoning: number };
  chatState?: ChatState;
  toolCallCount?: number;
  recentTools?: Array<{ name: string; summary: string; at: number }>;
  sessionError?: string;
  isRunning?: boolean;
  queuedMessage?: QueuedMessage;
  pendingDirectorySelect?: {
    pickerMessageId: string;
    text: string;
    mode?: string;
    model?: string;
    messageId?: string;
    references?: any;
  };
  additionalDirs?: string[];
  cwdOverride?: string;
  forceDirectoryPicker?: boolean;
}

const CODEX_TAG = 'codex';

export function getCodexState(services: Services, threadId: string): CodexThreadState | undefined {
  const thread = services.repository.threadQueries.byId(threadId as any) as any;
  return thread?.context?.codex as CodexThreadState | undefined;
}

export function persistCodexState(services: Services, threadId: string, state: CodexThreadState): void {
  const thread = services.repository.threadQueries.byId(threadId as any) as any;
  if (!thread) return;

  const existing = (thread.context?.codex || {}) as CodexThreadState;
  const nextContext = { ...(thread.context || {}), codex: { ...existing, ...state } };

  const existingTags: string[] = Array.isArray(thread.tags) ? thread.tags : [];
  const tagAdded = !existingTags.includes(CODEX_TAG);
  const nextTags = tagAdded ? [...existingTags, CODEX_TAG] : existingTags;

  services.repository.threadCommands.update(threadId as any, { context: nextContext, tags: nextTags });
  services.emitter.sendToPlugin('threads', {
    type: 'THREAD_UPDATED',
    threadId,
    updates: { ...(tagAdded ? { tags: nextTags } : {}), context: nextContext },
  });
}

export function updateCodexState(
  services: Services, threadId: EntityId,
  patch: Partial<CodexThreadState> | ((prev: CodexThreadState) => Partial<CodexThreadState>),
): boolean {
  const state = getCodexState(services, threadId as string);
  if (!state) return false;
  persistCodexState(services, threadId as string, (typeof patch === 'function' ? patch(state) : patch) as any);
  return true;
}

export function ensureSessionMarker(services: Services, threadId: EntityId): EntityId {
  return services.artifact.findOrCreateByType(threadId, 'codex-session', { title: 'Codex session', content: {} }).artifactId;
}

export function updateChatState(services: Services, threadId: EntityId, chatState: ChatState): void {
  persistCodexState(services, threadId as string, { chatState });
  services.threads.updateChatState(threadId, chatState);
}

export function setRunning(services: Services, threadId: string, running: boolean): void {
  persistCodexState(services, threadId, { isRunning: running });
}

export function enqueueMessage(services: Services, threadId: string, msg: QueuedMessage): void {
  const prior = getCodexState(services, threadId);
  const prevMessageId = prior?.queuedMessage?.messageId;
  if (prevMessageId && prevMessageId !== msg.messageId) {
    services.chat.updateMessageState(prevMessageId as any, { status: 'cancelled' } as any);
  }
  persistCodexState(services, threadId, { queuedMessage: msg });
}

export function dequeueMessage(services: Services, threadId: string): QueuedMessage | undefined {
  const prior = getCodexState(services, threadId);
  const msg = prior?.queuedMessage;
  if (msg) persistCodexState(services, threadId, { queuedMessage: undefined });
  return msg;
}

export function killTurn(services: Services, threadId: string): void {
  const handle = (services.codex as any).getHandle(threadId);
  if (handle) {
    try { handle.abort(); } catch { /* already gone */ }
    (services.codex as any).clearHandle(threadId);
  }

  const queued = dequeueMessage(services, threadId);
  if (queued?.messageId) {
    services.chat.updateMessageState(queued.messageId as any, { status: 'cancelled' } as any);
  }

  persistCodexState(services, threadId, { isRunning: false });
}
