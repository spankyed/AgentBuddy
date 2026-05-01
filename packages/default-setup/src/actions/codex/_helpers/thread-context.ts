/**
 * Helpers for reading/writing `thread.context.codex` and toggling
 * the `codex` tag.
 *
 * Pattern mirrors `claude-code/_helpers/thread-context.ts` but manages
 * Codex-specific state: conversation history (CoreMessage[]), pending
 * tool calls, model selection, and token usage.
 */

import type { Services, EntityId } from '../../../types';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Unified chat state used in backend events and on the frontend. */
export type ChatState = 'idle' | 'working' | 'paused' | 'error' | 'success';

export interface QueuedMessage {
  text: string;
  mode?: string;
  phase?: string;
  messageId?: string;
  references?: any;
}

export interface PendingToolCall {
  /** The Vercel AI SDK toolCallId. */
  toolCallId: string;
  /** Tool name (shell, apply_patch, etc.). */
  toolName: string;
  /** Tool arguments as JSON-serializable object. */
  args: Record<string, any>;
  /** The messageId of the approval block sent to the user. */
  approvalMessageId: string;
}

/**
 * Serialized conversation message. We store the Vercel AI SDK CoreMessage
 * shape but serialized (no class instances). The stream consumer
 * reconstructs the messages array on each turn.
 */
export interface SerializedMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: any;
  [key: string]: any;
}

export interface CodexThreadState {
  /** Full conversation history (Vercel AI SDK CoreMessage shape). */
  conversationHistory?: SerializedMessage[];
  /** Selected model (default: 'gpt-4.1'). */
  model?: string;
  /** Working directory for the Codex session. */
  cwd?: string;
  /** Number of turns executed. */
  turns?: number;
  /** Running token usage total. */
  totalTokens?: number;
  /** Running cost total in USD. */
  totalCostUsd?: number;
  /** High-level chat state. Drives the status indicator. */
  chatState?: ChatState;
  /** Epoch ms when the session was first created. */
  startedAt?: number;
  /** The most recent tool the agent used. */
  lastTool?: { name: string; summary: string; at: number };

  // ─── Ephemeral coordination state ──────────────────────────────────
  /** True while a chat action is actively running on this thread. */
  isRunning?: boolean;
  /** Message waiting to be processed after the current turn ends. */
  queuedMessage?: QueuedMessage;
  /** Set when a tool call needs user approval. */
  pendingToolCall?: PendingToolCall;
  /** Set when waiting for directory selection. */
  pendingDirectorySelect?: {
    pickerMessageId: string;
    text: string;
    mode?: string;
    phase?: string;
    model?: string;
    messageId?: string;
    references?: any;
  };
}

export const CODEX_TAG = 'codex';
export const DEFAULT_MODEL = 'gpt-4.1';

// ─── Core read/write ────────────────────────────────────────────────────────

/** Read the Codex state stashed on a thread. Returns `undefined` if none. */
export function getCodexState(services: Services, threadId: string): CodexThreadState | undefined {
  const thread = services.repository.threadQueries.byId(threadId as any) as any;
  return thread?.context?.codex as CodexThreadState | undefined;
}

/**
 * Merge partial state into `thread.context.codex` and add the `codex` tag
 * if missing. Idempotent.
 */
export function persistCodexState(
  services: Services,
  threadId: string,
  state: Partial<CodexThreadState>,
): void {
  const thread = services.repository.threadQueries.byId(threadId as any) as any;
  if (!thread) return;

  const existing = (thread.context?.codex || {}) as CodexThreadState;
  const nextContext = {
    ...(thread.context || {}),
    codex: { ...existing, ...state },
  };

  const existingTags: string[] = Array.isArray(thread.tags) ? thread.tags : [];
  const nextTags = existingTags.includes(CODEX_TAG)
    ? existingTags
    : [...existingTags, CODEX_TAG];

  const tagAdded = !existingTags.includes(CODEX_TAG);

  services.repository.threadCommands.update(threadId as any, {
    context: nextContext,
    ...(tagAdded && { tags: nextTags }),
  } as any);

  // Notify frontend of the state change.
  services.emitter.sendToPlugin('threads', {
    type: 'THREAD_UPDATED',
    threadId,
    context: nextContext,
    ...(tagAdded && { tags: nextTags }),
  } as any);
}

// ─── Convenience helpers ────────────────────────────────────────────────────

export function setRunning(services: Services, threadId: string, running: boolean): void {
  persistCodexState(services, threadId, { isRunning: running });
}

export function updateChatState(services: Services, threadId: string, chatState: ChatState): void {
  persistCodexState(services, threadId, { chatState });
}

export function enqueueMessage(services: Services, threadId: string, msg: QueuedMessage): void {
  persistCodexState(services, threadId, { queuedMessage: msg });
}

export function dequeueMessage(services: Services, threadId: string): QueuedMessage | undefined {
  const state = getCodexState(services, threadId);
  const queued = state?.queuedMessage;
  if (queued) {
    persistCodexState(services, threadId, { queuedMessage: undefined });
  }
  return queued;
}

export function killTurn(services: Services, threadId: string): void {
  persistCodexState(services, threadId, {
    isRunning: false,
    pendingToolCall: undefined,
    queuedMessage: undefined,
  });
}
