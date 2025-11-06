/**
 * Name: Create Birth Thread
 * Category: onboarding
 * Description: Creates the assistant birth thread with onboarding artifacts
 *
 * This action demonstrates the composable primitive pattern for creating threads and artifacts.
 * It uses services.repository.threadCommands.create() and services.artifact.create() to build
 * a complex workflow from simple primitives.
 */

import Services from '@/services';
import type { EARS } from '@/core/types';

export async function createBirthThread(params: any, services: typeof Services) {
  const ASSISTANT_BIRTH_ROLE = services.database.EARS.RoleKind.Custom('assistant_birth');

  // Check if birth thread already exists
  const existingBirthThreadId = services.database.qx().withRole(ASSISTANT_BIRTH_ROLE).first();

  if (existingBirthThreadId) {
    await services.logger.info('Birth thread already exists', {
      threadId: existingBirthThreadId
    });

    return {
      threadId: existingBirthThreadId,
      success: true,
      created: false
    };
  }

  // Create the birth thread with role and forced mode (service handles FE notification)
  const { id: threadId, shortCode, timestamp, status } = services.chat.createThreadAndNotify({
    topic: 'Assistant Birth',
    instructions: 'Welcome! This thread will help you get started with your new assistant.',
    tags: [],
    role: ASSISTANT_BIRTH_ROLE,
    forcedMode: 'birth'
  });

  // Create todo artifact (service handles FE notification)
  const { artifactId: todoArtifactId } = services.artifact.createAndNotify({
    artifactType: 'todo',
    title: 'Getting Started Tasks',
    content: {
      tasks: [
        { id: '1', description: 'Give your assistant a name', completed: false },
        { id: '2', description: 'Share your technical skill level', completed: false },
        { id: '3', description: 'Discuss projects you\'re working on', completed: false }
      ],
      status: 'pending'
    },
    threadId
  });

  // Create workspace artifact (service handles FE notification)
  const { artifactId: workspaceArtifactId } = services.artifact.createAndNotify({
    artifactType: 'workspace',
    title: 'My Workspaces',
    content: {},
    threadId
  });

  // Get full thread data for agent
  const threadData = services.repository.agentQueries.threadData(threadId);

  // Refresh agent thread list
  services.emitter.sendToPlugin('agent', {
    type: 'REFRESH_RECENT_THREADS',
    data: services.repository.agentQueries.refreshThreadsData()
  } as any);

  // Open the birth thread in chat
  services.emitter.sendToPlugin('agent', {
    type: 'LOAD_CHAT_THREAD',
    data: threadData
  } as any);

  await services.logger.info('Birth thread created and activated', {
    threadId,
    shortCode,
    todoArtifactId,
    workspaceArtifactId,
    artifactCount: threadData.artifacts?.length || 0
  });

  return {
    threadId,
    shortCode,
    timestamp,
    status,
    todoArtifactId,
    workspaceArtifactId,
    success: true,
    created: true
  };
}
