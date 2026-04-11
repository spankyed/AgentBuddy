/**
 * ClaudeCodeSession repository — thin CRUD layer using qx/tx.
 *
 * qx() / tx() are synchronous — do NOT await them.
 */
import { EARS } from '@/core/types';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';

export interface ClaudeCodeSessionRecord {
  id: EARS.EntityId;
  entityType: EARS.Entity.ClaudeCodeSession;
  threadId: EARS.EntityId;
  cliSessionId?: string;
  cwd: string;
  model?: string;
  permissionMode?: string;
  appendSystemPrompt?: string;
  addDirs?: string[];
  createdAt: number;
  lastActivityAt: number;
  updatedAt?: number;
}

export interface CreateSessionInput {
  threadId: EARS.EntityId;
  cwd: string;
  model?: string;
  permissionMode?: string;
  appendSystemPrompt?: string;
  addDirs?: string[];
}

/**
 * Create a new ClaudeCodeSession row linked to a thread.
 * If one already exists for the thread, it is returned unchanged.
 */
export function createSession(input: CreateSessionInput): ClaudeCodeSessionRecord {
  const existing = findByThreadId(input.threadId);
  if (existing) return existing;

  const now = Date.now();

  const attrs: Record<string, unknown> = {
    threadId: input.threadId,
    cwd: input.cwd,
    createdAt: now,
    lastActivityAt: now,
    updatedAt: now,
  };
  if (input.model) attrs.model = input.model;
  if (input.permissionMode) attrs.permissionMode = input.permissionMode;
  if (input.appendSystemPrompt) attrs.appendSystemPrompt = input.appendSystemPrompt;
  if (input.addDirs && input.addDirs.length) attrs.addDirs = input.addDirs;

  const sessionId = tx(EARS.Entity.ClaudeCodeSession)
    .batchPut(attrs)
    .link(EARS.RelKind.RELATES_TO, input.threadId)
    .id();

  // biome-ignore lint/style/noNonNullAssertion: we just wrote it
  return findById(sessionId)!;
}

export function findById(sessionId: EARS.EntityId): ClaudeCodeSessionRecord | null {
  const row = qx(sessionId).pickOne([
    'threadId',
    'cliSessionId',
    'cwd',
    'model',
    'permissionMode',
    'appendSystemPrompt',
    'addDirs',
    'createdAt',
    'lastActivityAt',
    'updatedAt',
  ] as const);
  if (!row) return null;
  return {
    id: sessionId,
    entityType: EARS.Entity.ClaudeCodeSession,
    threadId: row.threadId as EARS.EntityId,
    cliSessionId: row.cliSessionId as string | undefined,
    cwd: row.cwd as string,
    model: row.model as string | undefined,
    permissionMode: row.permissionMode as string | undefined,
    appendSystemPrompt: row.appendSystemPrompt as string | undefined,
    addDirs: row.addDirs as string[] | undefined,
    createdAt: (row.createdAt as number) ?? 0,
    lastActivityAt: (row.lastActivityAt as number) ?? 0,
    updatedAt: row.updatedAt as number | undefined,
  };
}

/**
 * Look up a session by its parent thread id.
 * Uses a simple scan — there is only one session per thread in practice.
 */
export function findByThreadId(threadId: EARS.EntityId): ClaudeCodeSessionRecord | null {
  const ids = qx(EARS.Entity.ClaudeCodeSession)
    .where('threadId', threadId)
    .ids();
  if (!ids || ids.length === 0) return null;
  return findById(ids[0] as EARS.EntityId);
}

export function attachCliSessionId(sessionId: EARS.EntityId, cliSessionId: string): void {
  tx(sessionId)
    .put('cliSessionId', cliSessionId)
    .put('updatedAt', Date.now());
}

export function touch(sessionId: EARS.EntityId): void {
  const now = Date.now();
  tx(sessionId)
    .put('lastActivityAt', now)
    .put('updatedAt', now);
}
