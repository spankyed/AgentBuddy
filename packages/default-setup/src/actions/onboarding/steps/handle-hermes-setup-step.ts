import type { ActionMeta, EntityId, Services } from '../../../types';
import { getOnboardingState, persistOnboardingState, finishOnboarding, flashState } from '../onboarding-helpers';

export const meta: ActionMeta = {
  label: 'Handle Hermes Setup Step',
  description: 'Navigates to Hermes plugin or finishes onboarding',
  category: 'onboarding',
  input: {
    threadId: { type: 'string', required: true },
    response: { type: 'any', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const threadId = params.threadId as EntityId;
  const response = typeof params.response === 'string' ? params.response : '';
  const state = getOnboardingState(services, threadId);
  if (!state) return { success: false, reason: 'no-state' };

  flashState(services, threadId, 'working', 'idle');

  if (response === 'yes') {
    services.chat.sendBlockMessage({
      threadId,
      text: 'To get started with Hermes:\n1. Go to **Settings \u2192 Plugins \u2192 Hermes** and enter your API key\n2. Open the **Hermes** plugin from the sidebar and click **Start Bridge**\n3. Switch to **Hermes** mode in any thread to chat with the agent',
      blocks: [],
      forkable: false,
    });
    (services.emitter as any).sendToPlugin('application', { type: 'SELECT_PLUGIN', targetId: 'hermes' });
  }

  finishOnboarding(services, state, threadId, { skipCompletionMessage: response === 'yes' });
  persistOnboardingState(services, threadId, state);
  return { success: true, step: state.step };
}
