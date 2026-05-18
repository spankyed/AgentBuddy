import type { EntityId, Services } from '../../types';

export interface OnboardingState {
  step: 'welcome' | 'cli-test-ask' | 'projects' | 'import-threads' | 'pick-thread' | 'hermes-setup' | 'complete';
  threadId: EntityId;
  pendingMessageId: EntityId;
  data: { cliFound?: boolean; authenticated?: boolean };
}

export function getOnboardingState(services: Services, threadId: EntityId): OnboardingState | null {
  const thread = services.repository.threadQueries.byId(threadId) as any;
  return thread?.context?.onboarding ?? null;
}

export function persistOnboardingState(services: Services, threadId: EntityId, state: OnboardingState) {
  const thread = services.repository.threadQueries.byId(threadId) as any;
  services.repository.threadCommands.update(threadId, {
    context: { ...(thread?.context || {}), onboarding: state },
  });
}

/**
 * Flash a chat state indicator then set the next persistent state (paused if more steps, idle if finishing).
 */
export function flashState(services: Services, threadId: EntityId, stateId: string = 'working', nextState: 'paused' | 'idle' = 'paused') {
  services.threads.updateChatState(threadId, nextState);
  services.emitter.sendToPlugin('threads', {
    type: 'FLASH_CHAT_STATE',
    threadId: threadId as string,
    stateId,
    durationMs: 800,
  });
}

/**
 * Finish onboarding. On first call, shows the Hermes setup prompt.
 * On second call (from hermes-setup handler), actually completes.
 */
export function finishOnboarding(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
  options?: { skipCompletionMessage?: boolean },
) {
  // If not yet past hermes-setup, show the prompt first
  if (state.step !== 'hermes-setup') {
    const { messageId } = services.chat.sendChoiceBlock({
      threadId,
      text: 'Would you like to set up Hermes Agent? Hermes is an autonomous AI agent framework that supports 200+ models from OpenAI, Anthropic, and more.',
      prompt: 'Set up Hermes?',
      choices: [
        { id: 'yes', label: 'Yes, set up Hermes', description: '' },
        { id: 'skip', label: 'Skip for now', description: '' },
      ],
      allowCustom: false,
      forkable: false,
      autoHide: true,
      asUser: true,
    } as any);
    state.step = 'hermes-setup';
    state.pendingMessageId = messageId as EntityId;
    return;
  }

  // Actually complete
  state.step = 'complete';

  services.settings.updateInternalSetting(['hasOnboarded'], true);

  services.repository.threadCommands.update(threadId, {
    topic: 'General',
    instructions: 'General conversation thread.',
    forcedMode: null,
  });

  if (!options?.skipCompletionMessage) {
    const allThreads = services.repository.threadQueries.all();
    const ccThreads = allThreads
      .filter((t: any) => t.tags?.includes('claude-code') && t.id !== threadId)
      .sort((a: any, b: any) => {
        const aTime = a.lastMessageTimestamp || a.timestamp;
        const bTime = b.lastMessageTimestamp || b.timestamp;
        return bTime - aTime;
      })
      .slice(0, 7);

    if (ccThreads.length > 0) {
      services.chat.sendChoiceBlock({
        threadId,
        text: "You're all setup! Here are some of your previous threads. Or click `+ New thread` below the chat to get to work on something new!",
        prompt: 'Continue a previous thread',
        choices: ccThreads.map((t: any) => ({ id: t.id, label: t.topic || 'Untitled', description: t.tags?.join(', ') || '' })),
        allowCustom: false,
        forkable: false,
      });
    } else {
      services.chat.sendBlockMessage({
        threadId,
        text: "You're all setup! Click `+ New thread` below the chat to get to work!",
        blocks: [],
        forkable: false,
      });
    }
  }

  if (!options?.skipCompletionMessage) {
    services.chat.openThreadChatAndRefreshRecent(threadId);
  }

  flashState(services, threadId, 'success', 'idle');

  services.emitter.sendToSystem('threads', { type: 'REFRESH_THREADS' });

  services.emitter.sendToPlugin('threads', {
    type: 'SET_MODE',
    mode: 'Claude Code',
  });

  (services.emitter as any).sendToPlugin('application', { type: 'RESTORE_CHAT' });
}
