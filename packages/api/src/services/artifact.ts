/**
 * Artifact Service
 *
 * Provides primitives for creating and managing artifacts across the application.
 * Follows a pure vs side-effect pattern similar to chat service.
 */

import { EARS } from '@/core/types';
import { sendToPlugin } from './event-emitter';
import { repository } from '@/repository';
import type { ArtifactType } from '@/systems/threads/types';

export interface CreateArtifactOptions {
  artifactType: ArtifactType;
  title: string;
  content: any;
  threadId?: EARS.EntityId;
  color?: string;
}

export interface UpdateArtifactOptions {
  title?: string;
  content?: unknown;
  /** Thread to emit the ARTIFACT_UPDATED event for. If omitted, no event is sent. */
  threadId?: EARS.EntityId;
}

/**
 * Create a new artifact and notify the frontend (with side effects)
 *
 * This function creates an artifact and automatically sends ARTIFACT_ADDED event
 * to the frontend when a threadId is provided. Use this in flow actions where
 * you want immediate UI updates.
 *
 * @param options - Options for creating the artifact
 * @returns Object containing the created artifact ID
 *
 * @example
 * // Create artifact with automatic FE notification
 * const { artifactId } = createAndNotify({
 *   artifactType: 'todo',
 *   title: 'Tasks',
 *   content: { tasks: [...] },
 *   threadId: 'thread-123'
 * });
 * // Frontend automatically receives ARTIFACT_ADDED event
 */
export function createAndNotify(options: CreateArtifactOptions): { artifactId: EARS.EntityId } {
  const result = repository.chatCommands.createArtifact(options);

  // Send FE notification if linked to thread
  if (options.threadId) {
    sendToPlugin('threads', {
      type: 'ARTIFACT_ADDED',
      tabId: options.threadId,
      artifact: {
        id: result.artifactId,
        type: options.artifactType,
        title: options.title,
        content: options.content,
        ...(options.color ? { color: options.color } : {}),
        metadata: {
          createdAt: Date.now()
        }
      }
    });
  }

  return result;
}

/**
 * Patch an existing artifact's title and/or content in place, and notify
 * the frontend so the panel re-renders with the new data.
 *
 * Used for artifacts that mutate across turns (e.g. the Claude Code session
 * card, which tracks live status/cost/turn count). The `ARTIFACT_UPDATED`
 * event mirrors `ARTIFACT_ADDED` but carries only the fields that changed.
 */
export function updateAndNotify(
  artifactId: EARS.EntityId,
  options: UpdateArtifactOptions,
): void {
  repository.chatCommands.updateArtifact(artifactId, {
    title: options.title,
    content: options.content,
  });

  if (options.threadId) {
    sendToPlugin('threads', {
      type: 'ARTIFACT_UPDATED',
      tabId: options.threadId,
      artifact: {
        id: artifactId,
        title: options.title,
        content: options.content,
        metadata: {
          updatedAt: Date.now()
        }
      }
    });
  }
}

/**
 * Find-or-create an artifact by (thread, artifactType). Guarantees at most
 * one artifact of the given type per thread. Useful for singletons like the
 * Claude Code session card that should only ever exist once per thread.
 */
export function findOrCreateByType(
  threadId: EARS.EntityId,
  artifactType: ArtifactType,
  initial: { title: string; content: any; color?: string },
): { artifactId: EARS.EntityId; created: boolean } {
  const existing = repository.chatCommands.findArtifactByType(threadId, artifactType);
  if (existing?.id) {
    return { artifactId: existing.id, created: false };
  }
  const { artifactId } = createAndNotify({
    artifactType,
    title: initial.title,
    content: initial.content,
    ...(initial.color ? { color: initial.color } : {}),
    threadId,
  });
  return { artifactId, created: true };
}
