import type { EntityId, Services } from '../../types';

export interface OnboardingState {
  step: 'welcome' | 'cli-test' | 'cli-test-ask' | 'projects' | 'import-threads' | 'complete';
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

export function finishOnboarding(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
) {
  state.step = 'complete';

  services.settings.updateInternalSetting(['hasOnboarded'], true);

  services.repository.threadCommands.update(threadId, {
    topic: 'General',
    instructions: 'General conversation thread.',
    forcedMode: null,
  });

  // Find recent claude-code threads to suggest
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
    const choices = ccThreads.map((t: any) => ({
      id: t.id,
      label: t.topic || 'Untitled',
      description: t.tags?.join(', ') || '',
    }));

    services.chat.sendChoiceBlock({
      threadId,
      text: "You're all setup! Here are some of your previous threads. Or click `+ New thread` below the chat to get to work on something new!",
      prompt: 'Continue a previous thread',
      choices,
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

  services.chat.openThreadChatAndRefreshRecent(threadId);

  services.emitter.sendToPlugin('threads', {
    type: 'SET_MODE',
    mode: 'manager',
  });
}
