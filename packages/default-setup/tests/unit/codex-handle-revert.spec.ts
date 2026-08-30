import { action as handleRevert } from '../../src/features/code/actions/claude-code/handle-revert';

function createServices(viewSessionResult: unknown[] | Error = [], sendBlockMessage = vi.fn()) {
  const thread = {
    id: 'thread-1',
    context: {
      claudeCode: {
        sessionId: 'session-1',
        cwd: '/project',
        isRunning: true,
      },
    },
    tags: ['claude-code'],
  };

  return {
    cli: {
      claudeCode: {
        getHandle: vi.fn(() => undefined),
        clearHandle: vi.fn(),
        viewSession: vi.fn(async () => {
          if (viewSessionResult instanceof Error) throw viewSessionResult;
          return viewSessionResult;
        }),
      },
    },
    repository: {
      threadQueries: {
        byId: vi.fn(() => thread),
      },
      threadCommands: {
        update: vi.fn((_threadId: string, updates: any) => {
          thread.context = updates.context;
          thread.tags = updates.tags ?? thread.tags;
        }),
      },
      chatQueries: {
        threadData: vi.fn(() => ({
          messages: [
            { id: 'msg-1', sender: 'user', text: 'hello' },
            { id: 'msg-2', sender: 'assistant', text: 'hi', context: { cliUuid: 'uuid-1' } },
          ],
        })),
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
    settings: {
      updatePluginSetting: vi.fn(),
    },
    artifact: {
      findOrCreateByType: vi.fn(() => ({ artifactId: 'art-1' })),
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  } as any;
}

describe('CC: Handle Revert', () => {
  it('reverts with valid cliUuid when viewSession confirms it', async () => {
    const services = createServices([
      { type: 'assistant', uuid: 'uuid-1' },
    ]);

    const result = await handleRevert({
      threadId: 'thread-1',
      messageId: 'msg-2',
    }, services);

    expect(result).toMatchObject({
      success: true,
      cliUuid: 'uuid-1',
    });
    expect(services.threads.updateChatState).toHaveBeenLastCalledWith('thread-1', 'idle');
  });

  it('clears cliUuid when viewSession shows UUID not in session (post-compaction)', async () => {
    const services = createServices([]);

    const result = await handleRevert({
      threadId: 'thread-1',
      messageId: 'msg-2',
    }, services);

    expect(result).toMatchObject({
      success: true,
      cliUuid: undefined,
    });
    expect(services.threads.updateChatState).toHaveBeenLastCalledWith('thread-1', 'idle');
  });

  it('clears cliUuid when viewSession throws', async () => {
    const services = createServices(new Error('JSONL not found'));

    const result = await handleRevert({
      threadId: 'thread-1',
      messageId: 'msg-2',
    }, services);

    expect(result).toMatchObject({
      success: true,
      cliUuid: undefined,
    });
    expect(services.logger.warn).toHaveBeenCalledWith(
      '[revert] could not validate cliUuid against session JSONL',
      expect.objectContaining({ cliUuid: 'uuid-1' }),
    );
  });
});
