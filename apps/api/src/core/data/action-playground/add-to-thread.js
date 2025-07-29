import Services from '@/services';

/**
 * Name: Add Message to Thread
 * Category: messaging
 * Description: Adds a new message to an existing thread or creates a new thread if none provided
 *
 * @param {Object} params
 * @param {string} [params.threadId] - Optional thread ID (creates new thread if not provided)
 * @param {string} params.text - Message content
 * @param {'user'|'assistant'|'system'} [params.sender='user'] - Message sender type
 * @param {typeof Services} services
 * @returns {Promise<Object>} Created message with id, threadId, text, sender, timestamp, success
 * @throws {Error} When text is missing or empty
 */
export async function addMessageToThread(params, services) {
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

  // Update thread's lastMessageTimestamp
  services.repository.threadCommands.update(threadId, {
    lastMessageTimestamp: result.data.timestamp
  });

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