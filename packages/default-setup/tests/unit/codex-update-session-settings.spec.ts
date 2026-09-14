import { vi, describe, expect, it } from 'vitest';
import { mockService } from '@abuddy/testing/harness';
import { services, type Services } from '@/__generated__/services';
import { repository } from '@/__generated__/repository';
import { action as updateSessionSettings } from '../../src/seeds/actions/codex/update-session-settings';

// The action runs on the harness's services: a real thread in the in-memory database, with the Codex
// app server and the chat and threads services it drives mocked
function createThread(codexState: Record<string, unknown>) {
  const { id } = repository.threadCommands.create({ topic: 'Codex', instructions: '', tags: [] });
  repository.threadCommands.update(id, { context: { codex: codexState } });
  mockService<Services, 'codex'>('codex', { respondToApproval: vi.fn().mockResolvedValue(undefined) } as never);
  mockService<Services, 'chat'>('chat', { updateMessageState: vi.fn() } as never);
  mockService<Services, 'threads'>('threads', { updateChatState: vi.fn() } as never);
  return id;
}

const codexState = (threadId: string) =>
  (repository.threadQueries.byId(threadId as never)?.context as { codex?: Record<string, unknown> } | undefined)?.codex;

describe('CDX: Update Session Settings', () => {
  it('approves a pending Codex tool approval when switching to auto', async () => {
    const threadId = createThread({
      pendingApproval: {
        requestId: 0,
        method: 'item/commandExecution/requestApproval',
        approvalMessageId: 'approval-1',
      },
      isRunning: false,
    });

    const result = await updateSessionSettings({ threadId, approvalMode: 'auto_review' }, services);

    expect(result).toEqual({ success: true });
    expect(services.codex.respondToApproval).toHaveBeenCalledWith(0, 'acceptForSession');
    expect(services.chat.updateMessageState).toHaveBeenCalledWith('approval-1', expect.objectContaining({
      blockResponse: { approved: true, decision: 'acceptForSession' },
    }));
    expect(services.threads.updateChatState).toHaveBeenCalledWith(threadId, 'working');
    const state = codexState(threadId);
    expect(state).toMatchObject({ approvalMode: 'auto_review', isRunning: true });
    expect(state?.pendingApproval).toBeUndefined();
  });

  it('does not approve a pending plan approval when switching to auto', async () => {
    const threadId = createThread({
      pendingApproval: {
        requestId: -1,
        method: 'plan/approval',
        approvalMessageId: 'approval-plan',
      },
      isRunning: false,
    });

    const result = await updateSessionSettings({ threadId, approvalMode: 'auto_review' }, services);

    expect(result).toEqual({ success: true });
    expect(services.codex.respondToApproval).not.toHaveBeenCalled();
    expect(services.chat.updateMessageState).not.toHaveBeenCalled();
    expect(services.threads.updateChatState).not.toHaveBeenCalled();
    expect(codexState(threadId)).toMatchObject({
      approvalMode: 'auto_review',
      pendingApproval: expect.objectContaining({ method: 'plan/approval' }),
    });
  });
});
