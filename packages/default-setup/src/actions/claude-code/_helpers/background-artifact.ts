/**
 * Background-processes artifact — find-or-create + sync helpers.
 *
 * The background-processes artifact shows a list of Bash commands that were
 * sent to background via `run_in_background: true`. It exists at most once
 * per thread and is updated whenever a task is backgrounded, completes, or
 * is cleaned up.
 */

import type { Services, EntityId } from '../../../types';
import { getBackgroundTasks, type BackgroundTask } from './thread-context';

export interface BackgroundProcessesArtifactContent {
  tasks: BackgroundTask[];
}

/** Find the existing background-processes artifact for a thread, or undefined. */
function findBackgroundArtifact(
  services: Services,
  threadId: EntityId,
): { id: EntityId; content: unknown } | undefined {
  const artifacts = services.repository.chatQueries.threadArtifacts(threadId) as Array<{
    id: EntityId;
    type: string;
    content: unknown;
  }>;
  return artifacts.find(a => a.type === 'background-processes');
}

/**
 * Ensure a background-processes artifact exists for the thread.
 * If one already exists, returns its id. Otherwise creates one.
 */
export function ensureBackgroundArtifact(
  services: Services,
  threadId: EntityId,
): EntityId {
  const { artifactId } = services.artifact.findOrCreateByType(
    threadId,
    'background-processes' as any,
    {
      title: 'Background Processes',
      content: { tasks: [] } as BackgroundProcessesArtifactContent,
    },
  );
  return artifactId;
}

/**
 * Sync the background-processes artifact with the current thread context.
 * Reads `backgroundTasks` from thread context and writes them to the artifact.
 * Creates the artifact if it doesn't exist yet.
 */
export function syncBackgroundArtifact(
  services: Services,
  threadId: EntityId | string,
): void {
  const tasks = getBackgroundTasks(services, threadId as string);

  // If no tasks, remove the artifact if it exists.
  if (tasks.length === 0) {
    const existing = findBackgroundArtifact(services, threadId as EntityId);
    if (existing) {
      // Update with empty tasks — don't delete the artifact entirely as
      // the frontend may still be displaying it. It will be cleaned up
      // on thread reset.
      services.artifact.updateAndNotify(existing.id, {
        content: { tasks: [] } as BackgroundProcessesArtifactContent,
        threadId: threadId as string,
      } as any);
    }
    return;
  }

  const artifactId = ensureBackgroundArtifact(services, threadId as EntityId);
  services.artifact.updateAndNotify(artifactId, {
    content: { tasks } as BackgroundProcessesArtifactContent,
    threadId: threadId as string,
  } as any);
}
