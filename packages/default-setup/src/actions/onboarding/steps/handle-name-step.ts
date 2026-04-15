import type { EntityId, Services } from '../../../types';
import { DEFAULT_NAME, TECH_LEVELS, type OnboardingState } from '../onboarding-helpers';
import type { ParsedStepResponse } from '../_helpers/parse-step-response';

export function handleNameStep(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
  parsed: Extract<ParsedStepResponse, { step: 'name' }>,
) {
  // Trim whitespace; fall back to DEFAULT_NAME on empty or cancelled.
  const trimmed = parsed.name.trim();
  const name = trimmed.length > 0 && !parsed.cancelled ? trimmed : DEFAULT_NAME;
  state.data.name = name;

  services.repository.settingsCommands.updateSettings('assistant', null, ['name'], name);

  const usedDefault = name === DEFAULT_NAME;
  const confirmText = usedDefault
    ? `No name provided — I'll go by ${DEFAULT_NAME}! You can always change it later in settings.`
    : `Nice to meet you! I'm ${name}.`;

  services.chat.sendBlockMessage({ threadId, text: confirmText, blocks: [], forkable: false });

  const { messageId } = services.chat.sendChoiceBlock({
    threadId,
    text: "How comfortable are you with code and technical topics?",
    prompt: 'Select your technical level',
    choices: TECH_LEVELS,
    displayText: 'Technical level:',
    forkable: false,
  });

  state.step = 'tech-level';
  state.pendingMessageId = messageId;
}
