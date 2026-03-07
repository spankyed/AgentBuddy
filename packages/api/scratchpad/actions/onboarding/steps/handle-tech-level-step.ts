import type { EntityId, Services } from '../../../types';
import { TECH_LEVELS, type OnboardingState } from '../onboarding-helpers';

export function handleTechLevelStep(
  services: Services,
  state: OnboardingState,
  threadId: EntityId,
  responseValue: any,
) {
  const techLevel = typeof responseValue === 'string' ? responseValue : responseValue?.id ?? 'comfortable';
  state.data.techLevel = techLevel;

  if (techLevel === 'beginner') {
    services.settings.updatePluginSetting('_meta', ['visibility', 'code'], false);
  }

  const levelLabel = TECH_LEVELS.find(t => t.id === techLevel)?.label ?? techLevel;
  services.chat.sendBlockMessage({
    threadId,
    text: `Got it — ${levelLabel}. I'll tailor my responses accordingly.`,
    blocks: [],
  });

  const { messageId } = services.chat.sendTextInputBlock({
    threadId,
    text: 'Do you have any project directories you\'d like me to know about? Enter one path per line, or leave blank to skip.',
    prompt: 'Share your project paths',
    placeholder: '/Users/you/projects/my-app\n/Users/you/projects/another-app',
    multiline: true,
    displayText: 'Projects:',
  });

  state.step = 'projects';
  state.pendingMessageId = messageId;
}
