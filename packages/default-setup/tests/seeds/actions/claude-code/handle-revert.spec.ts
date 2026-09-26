import { vi, describe, expect, it } from 'vitest';
import { mockService } from '@abuddy/testing/harness';
import { services, type Services } from '@/__generated__/services';
import { repository } from '@/__generated__/repository';
import { action as handleRevert } from '../../../../src/seeds/actions/claude-code/handle-revert';

// The action runs on the harness's services: a real thread and messages in the in-memory database,
// with the CLI and the chat, threads, settings and artifact services it drives mocked
async function createServices(viewSessionResult: unknown[] | Error = [], sendBlockMessage = vi.fn()) {
  const { id: threadId } = repository.threadCommands.create({ topic: 'Revert', instructions: '', tags: ['claude-code'] });
  repository.threadCommands.update(threadId, { context: { claudeCode: { sessionId: 'session-1', cwd: '/project', isRunning: true } } });
  repository.chatCommands.addMessage({ threadId, sender: 'user', text: 'hello' });
  const assistant = repository.chatCommands.addMessage({ threadId, sender: 'assistant', text: 'hi', context: { cliUuid: 'uuid-1' } });

  mockService<Services, 'cli'>('cli', {
    claudeCode: {
      getHandle: vi.fn(() => undefined),
      clearHandle: vi.fn(),
      viewSession: vi.fn(async () => {
        if (viewSessionResult instanceof Error) throw viewSessionResult;
        return viewSessionResult;
      }),
    } as never,
  });
  mockService<Services, 'chat'>('chat', { updateMessageState: vi.fn(), sendBlockMessage } as never);
  mockService<Services, 'threads'>('threads', { updateChatState: vi.fn() } as never);
  mockService<Services, 'settings'>('settings', { updatePluginSetting: vi.fn() } as never);
  mockService<Services, 'artifact'>('artifact', { findOrCreateByType: vi.fn(() => ({ artifactId: 'art-1' })) } as never);
  mockService<Services, 'logger'>('logger', { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
  return { threadId, messageId: assistant.id };
}

describe('CC: Handle Revert', () => {
  it('reverts with valid cliUuid when viewSession confirms it', async () => {
    const { threadId, messageId } = await createServices([
      { type: 'assistant', uuid: 'uuid-1' },
    ]);

    const result = await handleRevert({ threadId, messageId }, services);

    expect(result).toMatchObject({
      success: true,
      cliUuid: 'uuid-1',
    });
    expect(services.threads.updateChatState).toHaveBeenLastCalledWith(threadId, 'idle');
  });

  it('clears cliUuid when viewSession shows UUID not in session (post-compaction)', async () => {
    const { threadId, messageId } = await createServices([]);

    const result = await handleRevert({ threadId, messageId }, services);

    expect(result).toMatchObject({
      success: true,
      cliUuid: undefined,
    });
    expect(services.threads.updateChatState).toHaveBeenLastCalledWith(threadId, 'idle');
  });

  it('clears cliUuid when viewSession throws', async () => {
    const { threadId, messageId } = await createServices(new Error('JSONL not found'));

    const result = await handleRevert({ threadId, messageId }, services);

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
