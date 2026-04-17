/**
 * Background processes artifact — tracks CLI-spawned background tasks.
 *
 * Created lazily when the first background process is detected (either
 * via `run_in_background: true` on the Bash tool, or when the auto-release
 * threshold fires for a long-running foreground command). At most one
 * bg-processes artifact exists per thread (singleton via findOrCreateByType).
 *
 * Follows the same read-modify-write pattern as session-artifact.ts.
 */

import type { Services, EntityId } from '../../../types';

export type BgProcessStatus = 'running' | 'completed' | 'failed' | 'unknown';

export interface BgProcessEntry {
  toolUseId: string;
  backgroundTaskId?: string;
  command: string;
  commandSummary: string;
  status: BgProcessStatus;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  outputSummary?: string;
  autoReleased?: boolean;
}

export interface BgProcessesArtifactContent {
  processes: BgProcessEntry[];
}

/** Shorten a command string for display (max 60 chars). */
function shortenCommand(command: string): string {
  const trimmed = command.trim();
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 57) + '…';
}

/** Find the existing bg-processes artifact for a thread, or undefined. */
function findBgProcessesArtifact(
  services: Services,
  threadId: string,
): { id: EntityId; content: BgProcessesArtifactContent } | undefined {
  const artifacts = services.repository.chatQueries.threadArtifacts(threadId as any) as Array<{
    id: EntityId;
    type: string;
    content: unknown;
  }>;
  const found = artifacts.find(a => a.type === 'bg-processes');
  if (!found) return undefined;
  return {
    id: found.id,
    content: (found.content as BgProcessesArtifactContent) ?? { processes: [] },
  };
}

/**
 * Add a new background process entry to the artifact. Creates the artifact
 * lazily if it doesn't exist yet. If a process with the same toolUseId
 * already exists, this is a no-op.
 */
export function addBgProcess(
  services: Services,
  threadId: string,
  entry: {
    toolUseId: string;
    command: string;
    status?: BgProcessStatus;
    autoReleased?: boolean;
    durationMs?: number;
    backgroundTaskId?: string;
  },
): void {
  const existing = findBgProcessesArtifact(services, threadId);

  const newEntry: BgProcessEntry = {
    toolUseId: entry.toolUseId,
    command: entry.command,
    commandSummary: shortenCommand(entry.command),
    status: entry.status ?? 'running',
    startedAt: Date.now(),
    autoReleased: entry.autoReleased,
    durationMs: entry.durationMs,
    backgroundTaskId: entry.backgroundTaskId,
  };

  if (existing) {
    // Don't add duplicate entries.
    if (existing.content.processes.some(p => p.toolUseId === entry.toolUseId)) return;

    const nextContent: BgProcessesArtifactContent = {
      processes: [...existing.content.processes, newEntry],
    };
    services.artifact.updateAndNotify(existing.id, {
      content: nextContent,
      threadId: threadId as EntityId,
    });
  } else {
    // Lazy creation — first bg process on this thread.
    services.artifact.findOrCreateByType(
      threadId as EntityId,
      'bg-processes' as any,
      {
        title: 'Background Processes',
        content: { processes: [newEntry] } as BgProcessesArtifactContent,
      },
    );
  }
}

/**
 * Update an existing background process entry by toolUseId. No-op if the
 * toolUseId doesn't match any tracked process (safe to call for all tool results).
 */
export function updateBgProcess(
  services: Services,
  threadId: string,
  toolUseId: string,
  patch: Partial<BgProcessEntry>,
): void {
  const existing = findBgProcessesArtifact(services, threadId);
  if (!existing) return;

  const idx = existing.content.processes.findIndex(p => p.toolUseId === toolUseId);
  if (idx === -1) return;

  const updated = { ...existing.content.processes[idx], ...patch };
  const nextProcesses = [...existing.content.processes];
  nextProcesses[idx] = updated;

  services.artifact.updateAndNotify(existing.id, {
    content: { processes: nextProcesses } as BgProcessesArtifactContent,
    threadId: threadId as EntityId,
  });
}
