import { EARS } from '@/core/types';
import { repository } from '@/repository';
import type { BlockConfig, ArtifactEntity, ButtonConfig } from '@/systems/threads/types';
import { sendToPlugin } from './event-emitter';
import { tx } from '@/core/ears/helpers/transaction';

/**
 * Block-based artifact helpers for creating composable artifacts
 *
 * These helpers make it easy to create artifacts using reusable blocks that can be
 * mixed and matched to create complex interactions.
 */

interface CreateArtifactOptions {
  threadId: EARS.EntityId;
  title: string;
  artifactType: ArtifactEntity['artifactType'];
  blocks: BlockConfig[];
}

/**
 * Create an artifact with custom blocks (pure function)
 * Returns artifact data without side effects
 */
export function createArtifactWithBlocks(options: CreateArtifactOptions): {
  artifactId: EARS.EntityId;
  threadId: EARS.EntityId;
  artifact: Partial<ArtifactEntity>;
} {
  const { threadId, title, artifactType, blocks } = options;

  const now = Date.now();

  const artifactId = tx(EARS.Entity.Artifact)
    .put('entityType', EARS.Entity.Artifact)
    .put('title', title)
    .put('artifactType', artifactType)
    .put('blocks', blocks)
    .put('createdAt', now)
    .put('updatedAt', now)
    .id();

  // Link artifact to thread
  tx(threadId).link(EARS.RelKind.HAS, artifactId);
  tx(artifactId).link(EARS.RelKind.RELATES_TO, threadId);

  const artifact: Partial<ArtifactEntity> = {
    id: artifactId,
    entityType: EARS.Entity.Artifact,
    title,
    artifactType,
    blocks,
    createdAt: now,
    updatedAt: now,
  };

  return { artifactId, threadId, artifact };
}

/**
 * Send an artifact with custom blocks and emit ARTIFACT_ADDED event
 * Use this for flow actions that need automatic frontend updates
 */
export function sendArtifactWithBlocks(options: CreateArtifactOptions): { artifactId: EARS.EntityId } {
  const result = createArtifactWithBlocks(options);

  // Emit artifact added event
  sendToPlugin('agent', {
    type: 'ARTIFACT_ADDED',
    tabId: result.threadId,
    artifact: result.artifact
  } as any);

  return { artifactId: result.artifactId };
}

/**
 * Update artifact state with any mutable fields
 * Main interface for ad hoc artifact state updates (title, blocks, blockResponse, responseTimestamp, content)
 * Automatically emits ARTIFACT_STATE_UPDATED event to frontend
 *
 * @example
 * // Re-enable interactive blocks by clearing response
 * updateArtifactState(artifactId, {
 *   responseTimestamp: undefined,
 *   blockResponse: undefined
 * });
 *
 * @example
 * // Update artifact title and blocks
 * updateArtifactState(artifactId, {
 *   title: 'Updated Title',
 *   blocks: [...]
 * });
 */
export function updateArtifactState(
  artifactId: EARS.EntityId,
  updates: Partial<Pick<ArtifactEntity, 'title' | 'blocks' | 'blockResponse' | 'responseTimestamp' | 'content'>>
): void {
  const result = repository.agentCommands.updateArtifactState({
    artifactId,
    updates
  });

  // Emit ARTIFACT_STATE_UPDATED event to frontend with all updated fields
  sendToPlugin('agent', {
    type: 'ARTIFACT_STATE_UPDATED',
    artifactId: result.artifactId,
    ...result.updates
  } as any);
}

/**
 * Create a code artifact with syntax highlighting and action buttons
 */
export function createCodeArtifact(options: {
  threadId: EARS.EntityId;
  title: string;
  code: string;
  language: string;
  actions?: ButtonConfig[];
}): { artifactId: EARS.EntityId } {
  const { threadId, title, code, language, actions } = options;

  const blocks: BlockConfig[] = [
    {
      type: 'code-display',
      props: { code, language }
    }
  ];

  if (actions && actions.length > 0) {
    blocks.push({
      type: 'button-group',
      props: { buttons: actions, keepInteractive: true }
    });
  }

  return sendArtifactWithBlocks({
    threadId,
    title,
    artifactType: 'code',
    blocks
  });
}

/**
 * Create a todo list artifact with approve/reject buttons
 */
export function createTodoArtifact(options: {
  threadId: EARS.EntityId;
  title: string;
  tasks: Array<{ id: string; description: string; completed: boolean }>;
  status?: 'pending' | 'approved' | 'rejected';
  actions?: ButtonConfig[];
}): { artifactId: EARS.EntityId } {
  const { threadId, title, tasks, status = 'pending', actions } = options;

  const blocks: BlockConfig[] = [
    {
      type: 'todo-list',
      props: { tasks, status }
    }
  ];

  if (actions && actions.length > 0) {
    blocks.push({
      type: 'button-group',
      props: { buttons: actions, keepInteractive: true }
    });
  }

  return sendArtifactWithBlocks({
    threadId,
    title,
    artifactType: 'todo',
    blocks
  });
}

/**
 * Create a workspace configuration artifact
 */
export function createWorkspaceArtifact(options: {
  threadId: EARS.EntityId;
  title: string;
  config: any;
  actions?: ButtonConfig[];
}): { artifactId: EARS.EntityId } {
  const { threadId, title, config, actions } = options;

  const blocks: BlockConfig[] = [
    {
      type: 'workspace-config',
      props: { config }
    }
  ];

  if (actions && actions.length > 0) {
    blocks.push({
      type: 'button-group',
      props: { buttons: actions, keepInteractive: true }
    });
  }

  return sendArtifactWithBlocks({
    threadId,
    title,
    artifactType: 'workspace',
    blocks
  });
}

/**
 * Create a Slack channels artifact
 */
export function createSlackArtifact(options: {
  threadId: EARS.EntityId;
  title: string;
  channels: any[];
  actions?: ButtonConfig[];
}): { artifactId: EARS.EntityId } {
  const { threadId, title, channels, actions } = options;

  const blocks: BlockConfig[] = [
    {
      type: 'slack-channels',
      props: { channels }
    }
  ];

  if (actions && actions.length > 0) {
    blocks.push({
      type: 'button-group',
      props: { buttons: actions, keepInteractive: true }
    });
  }

  return sendArtifactWithBlocks({
    threadId,
    title,
    artifactType: 'slack',
    blocks
  });
}

/**
 * Create an image display artifact
 */
export function createImageArtifact(options: {
  threadId: EARS.EntityId;
  title: string;
  imageUrl: string;
  alt?: string;
  actions?: ButtonConfig[];
}): { artifactId: EARS.EntityId } {
  const { threadId, title, imageUrl, alt, actions } = options;

  const blocks: BlockConfig[] = [
    {
      type: 'image-display',
      props: { imageUrl, alt }
    }
  ];

  if (actions && actions.length > 0) {
    blocks.push({
      type: 'button-group',
      props: { buttons: actions, keepInteractive: true }
    });
  }

  return sendArtifactWithBlocks({
    threadId,
    title,
    artifactType: 'image',
    blocks
  });
}

/**
 * Create a review/feedback artifact
 */
export function createReviewArtifact(options: {
  threadId: EARS.EntityId;
  title: string;
  reviewContent: any;
  actions?: ButtonConfig[];
}): { artifactId: EARS.EntityId } {
  const { threadId, title, reviewContent, actions } = options;

  const blocks: BlockConfig[] = [
    {
      type: 'review-display',
      props: { reviewContent }
    }
  ];

  if (actions && actions.length > 0) {
    blocks.push({
      type: 'button-group',
      props: { buttons: actions, keepInteractive: true }
    });
  }

  return sendArtifactWithBlocks({
    threadId,
    title,
    artifactType: 'review',
    blocks
  });
}
