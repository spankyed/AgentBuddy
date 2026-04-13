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
 * This helper wraps `services.artifact.findOrCreateByType` +
 * `services.artifact.updateAndNotify` and caches the artifact id per
 * thread in a module-level Map so repeated calls within the same process
 * lifetime skip the LMDB lookup.
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

export interface SessionArtifactContent {
  sessionId: string;
  model: string;
  cwd: string;
  startedAt: number;
  lastTurnAt: number;
  turns: number;
  totalCostUsd: number;
  status: 'idle' | 'streaming' | 'awaiting-permission' | 'ended';
  toolCallCount: number;
  lastTool?: { name: string; summary: string; at: number };
  /**
   * Permission policy for the next turn. Optional for backwards compat
   * with session artifacts persisted before this field was introduced —
   * read through `readSessionPermissionMode` which coalesces to
   * `'acceptEdits'`. See ClaudeSessionArtifactContent in threads/types.ts.
   */
  permissionMode?: PermissionMode;
}

/** Thread → session artifact id. Survives across calls within one process. */
const sessionArtifactCache = new Map<string, EntityId>();

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
    status: 'streaming',
    toolCallCount: 0,
    permissionMode: 'default',
    ...partial,
  };
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
  const artifacts = services.repository.chatQueries.threadArtifacts(threadId) as Array<{
    id: EntityId;
    type: string;
    content: unknown;
  }>;
  const session = artifacts.find(a => a.type === 'claude-session');
  const content = session?.content as Partial<SessionArtifactContent> | undefined;
  return content?.permissionMode ?? 'acceptEdits';
}

/**
 * Ensure a claude-session artifact exists for the thread. If one already
 * exists (across turns), returns its id without creating a new one. If it
 * doesn't exist yet, creates one with `initial` content merged into the
 * default shape and returns the new id.
 *
 * The returned id is cached so subsequent calls skip the LMDB lookup.
 */
export function ensureSessionArtifact(
  services: Services,
  threadId: EntityId,
  initial: Partial<SessionArtifactContent> = {},
): EntityId {
  // Cache hit: the id we created earlier this process.
  const cached = sessionArtifactCache.get(threadId);
  if (cached) return cached;

  const { artifactId } = services.artifact.findOrCreateByType(
    threadId,
    'claude-session',
    {
      title: 'Claude Code session',
      content: makeInitialContent(initial),
    },
  );
  sessionArtifactCache.set(threadId, artifactId);
  return artifactId;
}

/**
 * Merge a patch into the session artifact's content field and notify the
 * frontend. Missing fields are preserved (partial updates). If the artifact
 * doesn't yet exist for this thread, this is a no-op — the caller should
 * call `ensureSessionArtifact` first.
 *
 * The patch can also include a raw function that receives the current
 * content and returns the next content (useful for counters that need to
 * read-modify-write without a race).
 */
export function updateSessionArtifact(
  services: Services,
  threadId: EntityId,
  patch: Partial<SessionArtifactContent> | ((prev: SessionArtifactContent) => Partial<SessionArtifactContent>),
): void {
  const artifactId = sessionArtifactCache.get(threadId);
  if (!artifactId) return;

  // Read the latest content from the repository so counters compound
  // correctly across updates. The EARS query layer is synchronous.
  const current = (services.repository.chatQueries.threadArtifacts(threadId) as any[])
    .find(a => a.id === artifactId);
  const prevContent: SessionArtifactContent = (current?.content as SessionArtifactContent) ?? makeInitialContent({});

  const delta = typeof patch === 'function' ? patch(prevContent) : patch;
  const nextContent: SessionArtifactContent = {
    ...prevContent,
    ...delta,
    lastTurnAt: delta.lastTurnAt ?? prevContent.lastTurnAt,
  };

  services.artifact.updateAndNotify(artifactId, {
    content: nextContent,
    threadId,
  });
}
