import type { ActionMeta, Services, Z } from '../types';
import { buildButtonsWithDeploymentState, buildMockLinks, simulateDeployment } from './mock-block-helpers';

export const meta: ActionMeta = {
  label: 'Mock Block Messages',
  description: 'Creates a series of mock block-based messages for testing UI interactions',
  category: 'testing',
  input: {
    threadId: {
      type: 'string',
      description: 'The thread ID to send messages to',
      required: true,
    },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  flowId: string,
) {
  const threadId = params.threadId;

  // 1. File picker (directory) - demonstrates directory selection
  services.chat.sendFilePickerBlock({
    threadId,
    text: 'I need you to select a workspace directory to continue.',
    prompt: 'Select your project workspace directory',
    fileType: 'directory',
    allowMultiple: false,
    displayText: 'Selected directory:'
  });

  // 2. Choice (single-select) - demonstrates single-select with custom input
  services.chat.sendChoiceBlock({
    threadId,
    text: 'How would you like to proceed with this implementation?',
    prompt: 'Choose your preferred approach',
    choices: [
      { id: 'quick', label: 'Quick Setup', description: 'Use default configuration' },
      { id: 'custom', label: 'Custom Setup', description: 'Configure each option manually' },
      { id: 'advanced', label: 'Advanced Setup', description: 'Full control over all settings' }
    ],
    multiSelect: false,
    allowCustom: true,
    displayText: 'You selected:'
  });

  // 3. Approval with note - demonstrates approval with context and required reason
  services.chat.sendApprovalBlock({
    threadId,
    text: 'I will make the following changes to your codebase:\n\n- Update 3 configuration files\n- Add new dependency to package.json\n- Refactor authentication module',
    prompt: 'Do you approve these changes?',
    context: 'This will modify your existing authentication flow and add a new OAuth provider.',
    requireReason: true,
    allowReason: true
  });

  // 4. Choice (multi-select) - demonstrates multiple selection without custom input
  services.chat.sendChoiceBlock({
    threadId,
    text: 'Which testing frameworks would you like to set up? (Select all that apply)',
    prompt: 'Select testing frameworks',
    choices: [
      { id: 'jest', label: 'Jest', description: 'Popular JavaScript testing framework' },
      { id: 'vitest', label: 'Vitest', description: 'Vite-native testing framework' },
      { id: 'playwright', label: 'Playwright', description: 'End-to-end testing' },
      { id: 'cypress', label: 'Cypress', description: 'E2E testing framework' }
    ],
    multiSelect: true,
    allowCustom: false,
    displayText: 'Selected frameworks:'
  });

  // 5. File picker (multiple files) - demonstrates multiple file selection
  services.chat.sendFilePickerBlock({
    threadId,
    text: 'Please select the configuration files you want me to analyze.',
    prompt: 'Select configuration files',
    fileType: 'file',
    allowMultiple: true,
    displayText: 'Selected files:'
  });

  // 6. Text input (single line) - demonstrates single-line text with note
  services.chat.sendBlockMessage({
    threadId,
    text: 'What would you like to name your new component?',
    blocks: [
      {
        type: 'prompt',
        props: { content: 'Enter component name' }
      },
      {
        type: 'note',
        props: { content: 'Use PascalCase (e.g., MyComponent)', variant: 'info' }
      },
      {
        type: 'text',
        props: {
          placeholder: 'MyComponent',
          required: true,
          displayText: 'Component name:'
        }
      }
    ]
  });

  // 7. Text input (multiline) - demonstrates multiline text input
  services.chat.sendTextInputBlock({
    threadId,
    text: 'Please provide additional context about the issue you\'re experiencing.',
    prompt: 'Describe the issue in detail',
    placeholder: 'Enter description...',
    multiline: true,
    displayText: 'Response submitted'
  });

  // 8. Link block - demonstrates navigation links with different targets
  services.chat.sendLinkBlock({
    threadId,
    text: 'I\'ve created several resources for your project. You can access them using the links below:',
    links: buildMockLinks(threadId)
  });

  // 9. Button group - demonstrates both auto-toggle and manual state buttons
  const { messageId } = services.chat.sendButtonGroupBlock({
    threadId,
    text: 'Control panel - mix of auto-toggling and manually-controlled buttons:',
    prompt: 'Configure project settings',
    buttons: buildButtonsWithDeploymentState('ready'),
    keepInteractive: true,
    displayText: 'Action completed:'
  });

  simulateDeployment(services, messageId, buildButtonsWithDeploymentState);

  await services.logger.info('Mock block messages created', {
    threadId,
    messageCount: 9
  });

  return {
    threadId,
    success: true,
    messageCount: 9
  };
}
