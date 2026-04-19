/**
 * Claude Code session artifact — upsert helper.
 *
 * The session artifact is the "session header" for a work-mode thread: a
 * single, persistent card in the right panel that shows the current CLI
 * session's id, model, cwd, turn count, tool-call count, total cost, and
 * live status. It exists at most once per thread and updates across turns.
 *
 * Why an artifact, not a block: the data outlives every turn (the CLI's
 * `resume: sessionId` chain uses it), the user needs to see it while they
 * scroll back through older messages, and it has no lifecycle tied to any
 * single message. See ROADMAP.md (next to this folder) for the full
 * rationale.
 *
 * All lookups go directly through the in-memory EARS repository — no
 * module-level cache. EARS is LMDB-backed and kept in memory, so the
 * repository query is essentially a Map access already.
 */

import type { Services, EntityId } from '../../../types';

/**
 * Local mirror of `PermissionMode` (from `@/services/claude-code/types` on
 * the backend). Duplicated here so helper files in this folder can typecheck
 * without reaching across package boundaries — the default-setup sandbox
 * doesn't re-export backend types and regenerating defs for every edit is
 * too slow. Keep in sync with the canonical union.
 */
export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'bypassPermissions'
  | 'dontAsk'
  | 'auto';

/** Unified chat state used on the artifact, in backend events, and on the frontend. */
export type ChatState = 'idle' | 'working' | 'paused' | 'error';

export interface SessionArtifactContent {
  sessionId: string;
  model: string;
  cwd: string;
  startedAt: number;
  lastTurnAt: number;
  turns: number;
  totalCostUsd: number;
  chatState: ChatState;
  toolCallCount: number;
  lastTool?: { name: string; summary: string; at: number };
  recentTools?: Array<{ name: string; summary: string; at: number }>;
  /**
   * Permission policy for the next turn. Optional for backwards compat
   * with session artifacts persisted before this field was introduced —
   * read through `readSessionPermissionMode` which coalesces to
   * `'acceptEdits'`. See ClaudeSessionArtifactContent in threads/types.ts.
   */
  permissionMode?: PermissionMode;
  /** Whether to run in a git worktree for isolated file mutations. */
  useWorktree?: boolean;
  /** Human-readable error when the session is broken (e.g. JSONL deleted). */
  sessionError?: string;
  /** Cumulative input tokens from the latest turn — context window consumption. */
  contextTokens?: number;
  /** Threshold percentages that have already fired an alert (avoids re-alerting). */
  alertedThresholds?: number[];
}

/** Build a default SessionArtifactContent for a brand-new turn. */
function makeInitialContent(partial: Partial<SessionArtifactContent>): SessionArtifactContent {
  const now = Date.now();
  return {
    sessionId: '',
    model: '',
    cwd: '',
    startedAt: now,
    lastTurnAt: now,
    turns: 0,
    totalCostUsd: 0,
    chatState: 'working',
    toolCallCount: 0,
    permissionMode: 'default',
    ...partial,
  } as SessionArtifactContent;
}


/** Read the current chatState from the session artifact. */
export function readSessionChatState(
  services: Services,
  threadId: EntityId,
): ChatState | undefined {
  const session = findSessionArtifact(services, threadId);
  const content = session?.content as Partial<SessionArtifactContent> | undefined;
  return content?.chatState;
}

/** Find the existing claude-session artifact for a thread, or undefined. */
function findSessionArtifact(
  services: Services,
  threadId: EntityId,
): { id: EntityId; content: unknown } | undefined {
  const artifacts = services.repository.chatQueries.threadArtifacts(threadId) as Array<{
    id: EntityId;
    type: string;
    content: unknown;
  }>;
  return artifacts.find(a => a.type === 'claude-session');
}

/**
 * Read the permission mode stored on the session artifact. Returns the
 * user's current choice from the right-panel segmented control, or
 * `'acceptEdits'` if the artifact has no stored value yet.
 *
 * The default is `acceptEdits` (not `default`) because it matches the
 * Claude Code TUI's own default behaviour: file mutations (Write, Edit,
 * Bash) auto-approve, only unusual operations prompt. This eliminates
 * the prompt-fatigue users experience with `default` mode (which asks
 * for every non-allowlisted tool) and avoids the "allow for session"
 * gap where per-turn subprocess spawning loses in-memory permission
 * decisions between turns.
 *
 * Called by `chat.ts` at action entry to determine what `permissionMode`
 * to pass to the CLI for this turn. This is the single source of truth —
 * changing the mode via the UI directly mutates the artifact, and the
 * next turn picks up the new value automatically.
 */
export function readSessionPermissionMode(
  services: Services,
  threadId: EntityId,
): PermissionMode {
  const session = findSessionArtifact(services, threadId);
  const content = session?.content as Partial<SessionArtifactContent> | undefined;
  return content?.permissionMode ?? 'acceptEdits';
}

/** Read whether worktree mode is enabled for this thread's session. */
export function readWorktreeMode(
  services: Services,
  threadId: EntityId,
): boolean {
  const session = findSessionArtifact(services, threadId);
  const content = session?.content as Partial<SessionArtifactContent> | undefined;
  return content?.useWorktree ?? false;
}

/**
 * Read the cwd that was active when the session artifact was first created.
 * Populated from the CLI's `system` stream event on turn 1. Used by
 * `--rewind-files` and JSONL backfill to locate the session's transcript on
 * disk via `services.cli.claudeCode.sessions.view(sessionId, { cwd })`.
 * Returns undefined if no artifact exists yet or cwd isn't populated — the
 * caller should fall back to `process.cwd()`.
 */
export function readSessionCwd(
  services: Services,
  threadId: EntityId,
): string | undefined {
  const session = findSessionArtifact(services, threadId);
  const content = session?.content as Partial<SessionArtifactContent> | undefined;
  return content?.cwd || undefined;
}

/**
 * Ensure a claude-session artifact exists for the thread. If one already
 * exists (across turns), returns its id without creating a new one. If it
 * doesn't exist yet, creates one with `initial` content merged into the
 * default shape and returns the new id.
 */
export function ensureSessionArtifact(
  services: Services,
  threadId: EntityId,
  initial: Partial<SessionArtifactContent> = {},
): EntityId {
  const { artifactId } = services.artifact.findOrCreateByType(
    threadId,
    'claude-session',
    {
      title: 'Claude Code session',
      content: makeInitialContent(initial),
    },
  );
  return artifactId;
}

/**
 * Merge a patch into the session artifact's content field and notify the
 * frontend. Missing fields are preserved (partial updates). If no
 * claude-session artifact exists for this thread yet, this is a no-op.
 *
 * The patch can be a plain object or a function that receives the current
 * content and returns the delta (useful for counters that need to
 * read-modify-write).
 */
export function updateSessionArtifact(
  services: Services,
  threadId: EntityId,
  patch: Partial<SessionArtifactContent> | ((prev: SessionArtifactContent) => Partial<SessionArtifactContent>),
): boolean {
  const session = findSessionArtifact(services, threadId);
  if (!session) return false;

  const prevContent: SessionArtifactContent =
    (session.content as SessionArtifactContent) ?? makeInitialContent({});

  const delta = typeof patch === 'function' ? patch(prevContent) : patch;
  const nextContent: SessionArtifactContent = {
    ...prevContent,
    ...delta,
    lastTurnAt: delta.lastTurnAt ?? prevContent.lastTurnAt,
  };

  services.artifact.updateAndNotify(session.id, {
    content: nextContent,
    threadId,
  });
  return true;
}

/**
 * Update the chat state on the session artifact AND push a real-time
 * event to the frontend threads plugin. This is the single call site
 * for chat state transitions — use this instead of manually setting
 * `chatState` on the artifact.
 */
export function updateChatState(
  services: Services,
  threadId: EntityId,
  chatState: ChatState,
): void {
  const updated = updateSessionArtifact(services, threadId, { chatState });
  if (!updated) return;
  services.emitter.sendToPlugin('threads', {
    type: 'SET_CHAT_STATE',
    threadId: threadId as string,
    chatState,
  });
}

/**
 * Detect "No conversation found with session ID" from a CLI error message.
 * Returns the extracted session ID or undefined.
 */
export function extractStaleSessionId(errorMessage: string): string | undefined {
  const match = errorMessage.match(/No conversation found with session ID:?\s*(\S+)/i);
  return match?.[1];
}

/**
 * Mark the session artifact as broken: set chatState to 'error', store
 * the error message, and clear the sessionId so the next turn starts fresh.
 */
export function markSessionBroken(
  services: Services,
  threadId: EntityId,
  errorMessage: string,
): void {
  updateSessionArtifact(services, threadId, {
    chatState: 'error',
    sessionError: errorMessage,
    sessionId: '',
  });
  services.emitter.sendToPlugin('threads', {
    type: 'SET_CHAT_STATE',
    threadId: threadId as string,
    chatState: 'error',
  });
}
