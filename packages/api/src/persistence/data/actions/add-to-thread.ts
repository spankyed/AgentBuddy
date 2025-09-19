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
export async function addMessageToThread(params: any, services: typeof Services) {
  let { text, threadId, sender = 'user' } = params.message;

  if (!text || !text.trim()) {
    throw new Error('text is required and cannot be empty');
  }

  // Create a new thread if threadId is not provided
  let newThreadCreated = false;
  let threadResult: null | ReturnType<typeof services.repository.threadCommands.create> = null;


  if (!threadId) {
    threadResult = services.repository.threadCommands.create({
      topic: text.substring(0, 40), // Use first 40 chars of message as topic
      instructions: '',
    });


    threadId = threadResult.id;
    newThreadCreated = true;

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


  // Update thread's lastMessageTimestamp
  services.repository.threadCommands.update(threadId, {
    lastMessageTimestamp: result.timestamp
  });

  await services.logger.info('Message added to thread', {
    threadId,
    messageId: result.id,
    sender,
    textLength: text.length,
    newThread: !params.threadId
  });

  // If a new thread was created, notify frontend plugins
  if (newThreadCreated && threadResult) {
    // Get the full thread data
    const fullThreadData = services.repository.threadQueries.byId(threadResult.id);

    // Notify threads plugin about the new thread with complete data
    services.emitter.sendToPlugin('threads', {
      type: 'THREAD_CREATED',
      id: threadResult.id,
      shortCode: threadResult.shortCode,
      entityType: 'Thread' as any,
      timestamp: threadResult.timestamp,
      topic: fullThreadData?.topic,
      instructions: fullThreadData?.instructions,
      status: fullThreadData?.status
    } as any);

    // Get updated thread list for agent plugin
    const refreshThreadsData = services.repository.agentQueries.refreshThreadsData();

    // Send updated thread list to agent plugin
    services.emitter.sendToPlugin('agent', {
      type: 'REFRESH_RECENT_THREADS',
      data: refreshThreadsData
    } as any);

    await services.logger.info('Notified frontend plugins about new thread', {
      threadId: threadResult.id,
      threadCount: refreshThreadsData.threads.length
    });
  }

  return {
    ...result,
    success: true
  };
}