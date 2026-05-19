import { action as handleRevert } from '../../src/actions/codex/handle-revert';

function createServices(rollbackThread: any, sendBlockMessage = vi.fn()) {
  const thread = {
    id: 'thread-1',
    context: {
      codex: {
        threadId: 'codex-thread-1',
        turnId: 'turn-1',
        activeMessageId: 'msg-active',
        pendingApproval: { requestId: 1, method: 'item/commandExecution/requestApproval', approvalMessageId: 'approval-1' },
        isRunning: true,
      },
    },
    tags: [],
  };

  return {
    codex: {
      rollbackThread,
      interruptTurn: vi.fn(),
      unregisterConsumer: vi.fn(),
      getHandle: vi.fn(() => undefined),
      clearHandle: vi.fn(),
    },
    repository: {
      threadQueries: {
        byId: vi.fn(() => thread),
      },
      threadCommands: {
        update: vi.fn((_threadId, updates) => {
          thread.context = updates.context;
          thread.tags = updates.tags ?? thread.tags;
        }),
      },
    },
    chat: {
      updateMessageState: vi.fn(),
      sendBlockMessage,
    },
    threads: {
      updateChatState: vi.fn(),
    },
    emitter: {
      sendToPlugin: vi.fn(),
    },
    logger: {
      warn: vi.fn(),
    },
  } as any;
}

describe('CDX: Handle Revert', () => {
  it('clears stale Codex thread state when rollback says thread not found', async () => {
    const services = createServices(vi.fn().mockRejectedValue(new Error('thread not found')));

    const result = await handleRevert({
      threadId: 'thread-1',
      messageId: 'msg-1',
      deletedUserMessageCount: 1,
    }, services);

    expect(result).toMatchObject({
      success: true,
      rolledBack: false,
      staleCodexThread: true,
      reason: 'codex thread not found',
    });
    expect(services.chat.sendBlockMessage).not.toHaveBeenCalled();
    expect(services.threads.updateChatState).toHaveBeenLastCalledWith('thread-1', 'idle');
    expect(services.repository.threadCommands.update).toHaveBeenLastCalledWith('thread-1', expect.objectContaining({
      context: expect.objectContaining({
        codex: expect.objectContaining({
          threadId: undefined,
          turnId: undefined,
          activeMessageId: undefined,
          pendingApproval: undefined,
          isRunning: false,
        }),
      }),
    }));
  });

  it('reports non-stale rollback failures without throwing if notification fails', async () => {
    const services = createServices(
      vi.fn().mockRejectedValue(new Error('rollback exploded')),
      vi.fn(() => { throw new Error('Thread thread-1 not found'); }),
    );

    const result = await handleRevert({
      threadId: 'thread-1',
      messageId: 'msg-1',
      deletedUserMessageCount: 1,
    }, services);

    expect(result).toMatchObject({
      success: false,
      error: 'rollback exploded',
    });
    expect(services.threads.updateChatState).toHaveBeenLastCalledWith('thread-1', 'error');
    expect(services.logger.warn).toHaveBeenCalledWith('[codex] failed to notify rollback failure', {
      threadId: 'thread-1',
      error: 'Thread thread-1 not found',
    });
  });
});
