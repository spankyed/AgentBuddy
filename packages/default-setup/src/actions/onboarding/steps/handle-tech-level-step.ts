import type { EntityId, Services } from '../../../types';
import { TECH_LEVELS, type OnboardingState } from '../onboarding-helpers';
import type { ParsedStepResponse } from '../_helpers/parse-step-response';

export function handleTechLevelStep(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
  parsed: Extract<ParsedStepResponse, { step: 'tech-level' }>,
) {
  // Fall back to 'comfortable' on empty or cancelled. The old
  // `responseValue?.id` object fallback is removed — it was dead
  // code; no frontend block emits an object with an `.id` field,
  // ChoiceInput emits a raw string (the choice id itself).
  const techLevel = parsed.techLevel && !parsed.cancelled ? parsed.techLevel : 'comfortable';
  state.data.techLevel = techLevel;

  if (techLevel === 'beginner') {
    services.settings.updatePluginSetting('_meta', ['visibility', 'code'], false);
  }

  const levelLabel = TECH_LEVELS.find(t => t.id === techLevel)?.label ?? techLevel;
  services.chat.sendBlockMessage({
    threadId,
    text: `Got it — ${levelLabel}. I'll tailor my responses accordingly.`,
    blocks: [],
    forkable: false,
  });

  const { messageId } = services.chat.sendTextInputBlock({
    threadId,
    text: 'Do you have any project directories you\'d like me to know about? Enter one path per line, or leave blank to skip.',
    prompt: 'Share your project paths',
    placeholder: '/Users/you/projects/my-app\n/Users/you/projects/another-app',
    multiline: true,
    displayText: 'Projects:',
    forkable: false,
  });

  state.step = 'projects';
  state.pendingMessageId = messageId;
}
