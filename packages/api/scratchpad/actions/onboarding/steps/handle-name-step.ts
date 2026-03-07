import type { EntityId, Services } from '../../../types';
import { DEFAULT_NAME, TECH_LEVELS, type OnboardingState } from '../onboarding-helpers';

export function handleNameStep(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
  responseValue: any,
) {
  const name = (typeof responseValue === 'string' && responseValue.trim()) || DEFAULT_NAME;
  state.data.name = name;

  services.repository.settingsCommands.updateSettings('assistant', null, ['name'], name);

  const usedDefault = name === DEFAULT_NAME;
  const confirmText = usedDefault
    ? `No name provided — I'll go by ${DEFAULT_NAME}! You can always change it later in settings.`
    : `Nice to meet you! I'm ${name}.`;

  services.chat.sendBlockMessage({ threadId, text: confirmText, blocks: [] });

  const { messageId } = services.chat.sendChoiceBlock({
    threadId,
    text: "How comfortable are you with code and technical topics?",
    prompt: 'Select your technical level',
    choices: TECH_LEVELS,
    displayText: 'Technical level:',
  });

  state.step = 'tech-level';
  state.pendingMessageId = messageId;
}
