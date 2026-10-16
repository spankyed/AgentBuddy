import { describe, expect, it, vi } from 'vitest';
import { mockService } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { repository } from '#generated/repository.ts';
import { action } from '../../../../src/content/actions/claude-code/reconcile-state.ts';
import { getClaudeState } from '../../../../src/content/actions/claude-code/_helpers/thread-context.ts';

function setup(mode: 'url' | 'form', live: boolean, toolPending = false) {
  const { id } = repository.threadCommands.create({ topic: 'Restart elicitation', instructions: '', tags: [] });
  repository.threadCommands.update(id, {
    chatState: 'paused',
    context: { claudeCode: {
      pendingElicitation: { requestId: 'request', approvalMessageId: 'form-ui', serverName: 'fixture', mode },
      ...(toolPending && { pendingControlRequest: { requestId: 'tool', approvalMessageId: 'tool-ui', toolName: 'Bash' } }),
    } },
  });
  mockService<Services, 'cli'>('cli', { claudeCode: {
    getConversation: vi.fn(() => live ? { owner: { hasPendingElicitation: (requestId: string) => requestId === 'request' } } : undefined),
    getHandle: vi.fn(),
  } as never });
  mockService<Services, 'chat'>('chat', { updateMessageState: vi.fn() });
  return id;
}

describe('restart reconciliation of native elicitation', () => {
  it.each(['url', 'form'] as const)('retires orphaned %s input and releases the paused thread', async mode => {
    const id = setup(mode, false);
    await action({}, services);
    const thread = repository.threadQueries.byId(id)!;
    expect(getClaudeState(services, id)?.pendingElicitation).toBeUndefined();
    expect(thread.chatState).toBe('idle');
    expect(services.chat.updateMessageState).toHaveBeenCalledWith('form-ui', expect.objectContaining({ blockResponse: { cancelled: true } }));
  });

  it('preserves a matching live owner on flow reentry', async () => {
    const id = setup('form', true);
    await action({}, services);
    const thread = repository.threadQueries.byId(id)!;
    expect(getClaudeState(services, id)?.pendingElicitation?.requestId).toBe('request');
    expect(thread.chatState).toBe('paused');
    expect(services.chat.updateMessageState).not.toHaveBeenCalled();
  });

  it('does not mistake a replacement owner for the original pending request', async () => {
    const id = setup('form', false);
    mockService<Services, 'cli'>('cli', { claudeCode: {
      getConversation: vi.fn(() => ({ owner: { hasPendingElicitation: () => false } })),
      getHandle: vi.fn(() => ({})),
    } as never });
    await action({}, services);
    expect(getClaudeState(services, id)?.pendingElicitation).toBeUndefined();
    expect(repository.threadQueries.byId(id)?.chatState).toBe('idle');
  });

  it('retires only the orphaned elicitation while preserving an independent paused tool request', async () => {
    const id = setup('form', false, true);
    await action({}, services);
    const thread = repository.threadQueries.byId(id)!;
    expect(getClaudeState(services, id)?.pendingElicitation).toBeUndefined();
    expect(getClaudeState(services, id)?.pendingControlRequest?.requestId).toBe('tool');
    expect(thread.chatState).toBe('paused');
    expect(services.chat.updateMessageState).toHaveBeenCalledTimes(1);
  });
});
