import type Services from '@/services';
import { EARS } from '@/types';

type Params = {
  threadId: EARS.EntityId; // The ID of the thread to which the message will be added
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
 * Description: Adds a new message to an existing thread with proper bidirectional linking
 *
 * @param params - Thread ID, message text, and optional sender type (defaults to 'user')
 * @param services - Repository and logger services
 * @returns The created message information
 * @throws When threadId/text is missing or thread not found
 */
export async function addMessageToThread(params: Params, services: typeof Services): Promise<Result> {
  const { threadId, text, sender = 'user' } = params;

  if (!threadId) {
    throw new Error('threadId is required');
  }
  if (!text || !text.trim()) {
    throw new Error('text is required and cannot be empty');
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
    textLength: text.length
  });

  return {
    ...result.data,
    success: true
  };
}