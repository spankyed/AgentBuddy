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
        metadata: {
          createdAt: Date.now()
        }
      }
    });
  }

  return result;
}
