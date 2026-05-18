/**
 * Helpers for reading/writing `thread.context.codex` and toggling
 * the `codex` tag.
 *
 * Mirrors the claude-code thread-context pattern. The Thread entity carries
 * a free-form `context` field. Codex parks its per-thread session state
 * under `context.codex` so the chat action can resume the right conversation
 * on subsequent turns.
 */

import type { Services, EntityId } from '../../../types';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Unified chat state used in backend events and on the frontend. */
export type ChatState = 'idle' | 'working' | 'paused' | 'error' | 'success';

export interface QueuedMessage {
  text: string;
  mode?: string;
  /** User message entity ID — for clearing the 'queued' status indicator on drain. */
  messageId?: string;
  /** Attached references (images, files, context) — preserved so they survive queuing. */
  references?: any;
}

export interface CodexThreadState {
  /** Codex SDK thread ID — used for resume via codex.resumeThread(). */
  threadId?: string;
  lastTurnAt?: number;
  /** Working directory for the Codex session. */
  cwd?: string;

  // ─── Persistent session data ──────────────────────────────────────
  /** Model name reported by the SDK. */
  model?: string;
  /** Epoch ms when the session was first created. */
  startedAt?: number;
  /** Number of turns executed in this session. */
  turns?: number;
  /** Running token totals across all turns. */
  totalTokens?: { input: number; output: number; reasoning: number };
  /** High-level chat state. Drives the status indicator and pause button. */
  chatState?: ChatState;
  /** Total tool calls across all turns in this session. */
  toolCallCount?: number;
  /** Last 3 tools executed (rolling window, most recent last). */
  recentTools?: Array<{ name: string; summary: string; at: number }>;
  /** Human-readable error when the session is broken. */
  sessionError?: string;

  // ─── Ephemeral coordination state ──────────────────────────────────
  /** True while a chat action invocation is actively running on this thread. */
  isRunning?: boolean;
  /** Message waiting to be processed after the current turn ends. */
  queuedMessage?: QueuedMessage;
  /** Additional working directories. Passed as additionalDirectories on every query. */
  additionalDirs?: string[];
  /** Pre-set CWD from "new thread in project" menu. Consumed on first message, then cleared. */
  cwdOverride?: string;
  /** When true, force the directory picker on first message regardless of global defaultBaseDirectory. */
  forceDirectoryPicker?: boolean;
}

export const CODEX_TAG = 'codex';

// ─── Core read/write ─────────────────────────────────────────────────────────

/** Read the Codex state stashed on a thread. Returns `undefined` if none. */
export function getCodexState(services: Services, threadId: string): CodexThreadState | undefined {
  const thread = services.repository.threadQueries.byId(threadId as any) as any;
  return thread?.context?.codex as CodexThreadState | undefined;
}

/**
 * Persist Codex state onto a thread (merging with any existing `context`)
 * and add the `codex` tag if missing. Idempotent.
 */
export function persistCodexState(
  services: Services,
  threadId: string,
  state: CodexThreadState,
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
    tags: nextTags,
  });

  // Notify frontend so thread context is always in sync.
  services.emitter.sendToPlugin('threads', {
    type: 'THREAD_UPDATED',
    threadId,
    updates: {
      ...(tagAdded ? { tags: nextTags } : {}),
      context: nextContext,
    },
  });
}

// ─── Writers ─────────────────────────────────────────────────────────────────

/**
 * Merge a patch into the thread's Codex state. The frontend receives
 * the update via `THREAD_UPDATED` (emitted by `persistCodexState`).
 */
export function updateCodexState(
  services: Services,
  threadId: EntityId,
  patch: Partial<CodexThreadState> | ((prev: CodexThreadState) => Partial<CodexThreadState>),
): boolean {
  const state = getCodexState(services, threadId as string);
  if (!state) return false;

  const delta = typeof patch === 'function' ? patch(state) : patch;
  persistCodexState(services, threadId as string, delta as any);
  return true;
}

/**
 * Ensure a codex-session artifact exists for the thread (type marker only).
 */
export function ensureSessionMarker(services: Services, threadId: EntityId): EntityId {
  const { artifactId } = services.artifact.findOrCreateByType(
    threadId,
    'codex-session',
    { title: 'Codex session', content: {} },
  );
  return artifactId;
}

/**
 * Update the chat state on the thread AND push a real-time event to the
 * frontend threads plugin.
 */
export function updateChatState(
  services: Services,
  threadId: EntityId,
  chatState: ChatState,
): void {
  persistCodexState(services, threadId as string, { chatState });
  services.threads.updateChatState(threadId, chatState);
}

// ─── Concurrency helpers ─────────────────────────────────────────────────────

/** Mark whether a chat action is currently running on this thread. */
export function setRunning(services: Services, threadId: string, running: boolean): void {
  persistCodexState(services, threadId, { isRunning: running });
}

/**
 * Queue a message for processing after the current turn ends.
 * Last write wins — prior queued message is marked 'cancelled'.
 */
export function enqueueMessage(services: Services, threadId: string, msg: QueuedMessage): void {
  const prior = getCodexState(services, threadId);
  const prevMessageId = prior?.queuedMessage?.messageId;
  if (prevMessageId && prevMessageId !== msg.messageId) {
    services.chat.updateMessageState(prevMessageId as any, { status: 'cancelled' } as any);
  }
  persistCodexState(services, threadId, { queuedMessage: msg });
}

/** Pop the queued message (if any) and clear it from the thread context. */
export function dequeueMessage(services: Services, threadId: string): QueuedMessage | undefined {
  const prior = getCodexState(services, threadId);
  const msg = prior?.queuedMessage;
  if (msg) {
    persistCodexState(services, threadId, { queuedMessage: undefined });
  }
  return msg;
}

/**
 * Abort the Codex handle, invalidate any queued messages, and clear all
 * mid-turn flags.
 */
export function killTurn(services: Services, threadId: string): void {
  const log = services.logger;
  const prior = getCodexState(services, threadId);

  log.info('[killTurn:codex] entered', {
    threadId,
    hasPrior: !!prior,
    isRunning: prior?.isRunning ?? null,
  });

  // Abort Codex turn via AbortController.
  const handle = (services.codex as any).getHandle(threadId);
  if (handle) {
    try { handle.abort(); } catch { /* already gone */ }
    (services.codex as any).clearHandle(threadId);
  }

  // Invalidate queued message so the user knows to resend.
  const queued = dequeueMessage(services, threadId);
  if (queued?.messageId) {
    services.chat.updateMessageState(queued.messageId as any, { status: 'cancelled' } as any);
  }

  // Clear all mid-turn flags.
  persistCodexState(services, threadId, {
    isRunning: false,
  });
}
