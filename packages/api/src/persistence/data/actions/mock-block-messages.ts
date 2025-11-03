// @ts-nocheck
import Services from '@/services';
import type { EARS } from '@/core/types';

/**
 * Name: Mock Block Messages
 * Category: testing
 * Description: Creates a series of mock block-based messages for testing UI interactions
 *
 * This action demonstrates all block interaction types available in the system.
 * It's intended as a reference implementation that can be copied into in-app workflows.
 *
 * @param params.threadId - The thread ID to send messages to (passed from flow)
 */
export async function mockBlockMessages(params: any, services: typeof Services) {
  threadId = params.threadId as EARS.EntityId;

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
    links: [
      {
        label: 'View Project Plan',
        event: {
          target: 'agent',
          data: {
            type: 'SELECT_ARTIFACT',
            artifactId: birthThread.artifactId
          }
        },
        icon: 'file-text'
      },
      {
        label: 'Open Birth Thread',
        event: {
          target: 'agent',
          data: {
            type: 'OPEN_THREAD_CHAT',
            threadId: threadId
          }
        },
        icon: 'message-square'
      },
      {
        label: 'Go to Threads',
        event: {
          target: 'application',
          data: {
            type: 'SELECT_PLUGIN',
            pluginId: 'threads'
          }
        },
        icon: 'settings'
      },
      {
        label: 'View Documentation',
        event: {
          target: 'external',
          data: {
            url: 'https://docs.example.com'
          }
        },
        icon: 'external-link'
      }
    ]
  });

  // 9. Button group - demonstrates both auto-toggle and manual state buttons
  const { messageId } = services.chat.sendButtonGroupBlock({
    threadId,
    text: 'Control panel - mix of auto-toggling and manually-controlled buttons:',
    prompt: 'Configure project settings',
    buttons: [
      // Auto-toggle buttons (frontend controlled, optimistic UI)
      {
        id: 'debug-mode',
        label: 'Debug Mode',
        state: 'off',
        toggleStates: {
          off: { label: 'Enable Debug Mode', variant: 'secondary' },
          on: { label: 'Disable Debug Mode', variant: 'success' }
        }
      },
      {
        id: 'auto-save',
        label: 'Auto Save',
        state: 'on',
        toggleStates: {
          on: { label: 'Auto Save: ON', variant: 'success' },
          off: { label: 'Auto Save: OFF', variant: 'danger' }
        }
      },
      // Manual state button (backend controlled, complex state machine)
      {
        id: 'deployment',
        label: 'Deployment',
        state: 'ready',
        states: {
          ready: { label: 'Deploy to Production', variant: 'primary' },
          deploying: { label: 'Deploying...', variant: 'secondary', disabled: true },
          deployed: { label: 'Deployed Successfully', variant: 'success' },
          failed: { label: 'Deployment Failed', variant: 'danger' }
        }
      }
    ],
    keepInteractive: true, // Buttons stay interactive after responses
    displayText: 'Action completed:'
  });

  // Note: toggleStates buttons (debug-mode, auto-save) automatically cycle on/off when clicked
  // Manual states buttons (deployment) require backend to update state:
  // When user clicks -> receive INTERACTIVE_MSG_RESPONSE with { buttonId, state }
  // Process the action -> update message blocks with new state using:
  // services.chat.updateMessageState(messageId, { blocks: [...] })

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
