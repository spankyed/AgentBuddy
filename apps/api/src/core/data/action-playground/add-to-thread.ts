import type Services from '@/services';
import { EARS } from '@/types';

type Params = {
  threadId?: EARS.EntityId; // The ID of the thread to which the message will be added (optional - will create new thread if not provided)
  text: string; // The content of the message to be added
  sender?: 'user' | 'assistant' | 'system'; // The sender of the message
};

type Result = {
  id: EARS.EntityId;
  threadId: EARS.EntityId;
  text: string;
  sender: string;
  timestamp: number;
  success: boolean;
};

/**
 * Name: Add Message to Thread
 * Category: messaging
 * Description: Adds a new message to an existing thread or creates a new thread if none provided
 *
 * @param params - Optional thread ID, message text, and optional sender type (defaults to 'user')
 * @param services - Repository and logger services
 * @returns The created message information with thread ID
 * @throws When text is missing or empty
 */
export async function addMessageToThread(params: Params, services: typeof Services): Promise<Result> {
  const { text, sender = 'user' } = params;
  let { threadId } = params;

  if (!text || !text.trim()) {
    throw new Error('text is required and cannot be empty');
  }

  // Create a new thread if threadId is not provided
  if (!threadId) {
    const threadResult = services.repository.threadCommands.create({
      topic: text.substring(0, 40), // Use first 40 chars of message as topic
      threadType: 'work-item',
      instructions: '',
    });

    if (!threadResult.success) {
      throw new Error(threadResult.error || 'Failed to create new thread');
    }

    threadId = threadResult.data.id;
    
    await services.logger.info('Created new thread for message', {
      threadId,
      topic: text.substring(0, 40),
    });
  }

  const result = services.repository.agentCommands.addMessage({
    threadId,
    text,
    sender
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to add message to thread');
  }

  await services.logger.info('Message added to thread', {
    threadId,
    messageId: result.data.id,
    sender,
    textLength: text.length,
    newThread: !params.threadId
  });

  return {
    ...result.data,
    success: true
  };
}