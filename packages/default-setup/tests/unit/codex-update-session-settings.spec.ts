import { action as updateSessionSettings } from '../../src/actions/codex/update-session-settings';

function createServices(codexState: any) {
  const thread = {
    id: 'thread-1',
    context: { codex: codexState },
    tags: [],
  };

  return {
    codex: {
      respondToApproval: vi.fn().mockResolvedValue(undefined),
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
    },
    threads: {
      updateChatState: vi.fn(),
    },
    emitter: {
      sendToPlugin: vi.fn(),
    },
  } as any;
}

describe('CDX: Update Session Settings', () => {
  it('approves a pending Codex tool approval when switching to auto', async () => {
    const services = createServices({
      pendingApproval: {
        requestId: 0,
        method: 'item/commandExecution/requestApproval',
        approvalMessageId: 'approval-1',
      },
      isRunning: false,
    });

    const result = await updateSessionSettings({
      threadId: 'thread-1',
      approvalMode: 'auto_review',
    }, services);

    expect(result).toEqual({ success: true });
    expect(services.codex.respondToApproval).toHaveBeenCalledWith(0, 'acceptForSession');
    expect(services.chat.updateMessageState).toHaveBeenCalledWith('approval-1', expect.objectContaining({
      blockResponse: { approved: true, decision: 'acceptForSession' },
    }));
    expect(services.threads.updateChatState).toHaveBeenCalledWith('thread-1', 'working');
    expect(services.repository.threadCommands.update).toHaveBeenLastCalledWith('thread-1', expect.objectContaining({
      context: expect.objectContaining({
        codex: expect.objectContaining({
          approvalMode: 'auto_review',
          pendingApproval: undefined,
          isRunning: true,
        }),
      }),
    }));
  });

  it('does not approve a pending plan approval when switching to auto', async () => {
    const services = createServices({
      pendingApproval: {
        requestId: -1,
        method: 'plan/approval',
        approvalMessageId: 'approval-plan',
      },
      isRunning: false,
    });

    const result = await updateSessionSettings({
      threadId: 'thread-1',
      approvalMode: 'auto_review',
    }, services);

    expect(result).toEqual({ success: true });
    expect(services.codex.respondToApproval).not.toHaveBeenCalled();
    expect(services.chat.updateMessageState).not.toHaveBeenCalled();
    expect(services.threads.updateChatState).not.toHaveBeenCalled();
    expect(services.repository.threadCommands.update).toHaveBeenLastCalledWith('thread-1', expect.objectContaining({
      context: expect.objectContaining({
        codex: expect.objectContaining({
          approvalMode: 'auto_review',
          pendingApproval: expect.objectContaining({ method: 'plan/approval' }),
        }),
      }),
    }));
  });
});
