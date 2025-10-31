import { assign, log, setup, fromPromise, spawnChild, type ActorRefFrom } from 'xstate';
import type { MessageEntity, ArtifactEntity, ThreadEntity, ThreadExtended, OutgoingAgentEvents, OutgoingThreadsEvents, AgentThreadData, Tab, ArtifactItem, ArtifactType, AgentSettings, AgentMode as AgentModeConfig } from '@app/api';
import breadcrumb from '@/core/breadcrumb';
import { safeEvents } from '@/core/types/safe-events';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/core/actors/route-trailer';
import { trpc } from '@/core/trpc';
import { application } from '@/core/actors/application';
import { type HotkeyEvent, type HotkeysMap, createHotkeyProcessor } from '@/core/utils/hotkeys';


// MOCK: Block-based messages for testing (shared between setStartupData and setThreadChatData)
export const createMockBlockMessages = (): Partial<MessageEntity>[] => [
  {
    id: 'Message-mock-file-picker' as any,
    entityType: 'Message' as any,
    text: 'I need you to select a workspace directory to continue.',
    sender: 'assistant' as const,
    timestamp: Date.now() - 9000,
    createdAt: Date.now() - 9000,
    blocks: [
      {
        type: 'prompt',
        props: { content: 'Select your project workspace directory' }
      },
      {
        type: 'file-picker',
        props: { fileType: 'directory', allowMultiple: false, displayText: 'Selected directory:' }
      }
    ],
  },
  {
    id: 'Message-mock-choice-single' as any,
    entityType: 'Message' as any,
    text: 'How would you like to proceed with this implementation?',
    sender: 'assistant' as const,
    timestamp: Date.now() - 8000,
    createdAt: Date.now() - 8000,
    blocks: [
      {
        type: 'prompt',
        props: { content: 'Choose your preferred approach' }
      },
      {
        type: 'choice',
        props: {
          choices: [
            { id: 'quick', label: 'Quick Setup', description: 'Use default configuration' },
            { id: 'custom', label: 'Custom Setup', description: 'Configure each option manually' },
            { id: 'advanced', label: 'Advanced Setup', description: 'Full control over all settings' },
          ],
          multiSelect: false,
          allowCustom: true,
          displayText: 'You selected:'
        }
      }
    ],
  },
  {
    id: 'Message-mock-approval' as any,
    entityType: 'Message' as any,
    text: 'I will make the following changes to your codebase:\n\n- Update 3 configuration files\n- Add new dependency to package.json\n- Refactor authentication module',
    sender: 'assistant' as const,
    timestamp: Date.now() - 7000,
    createdAt: Date.now() - 7000,
    blocks: [
      {
        type: 'prompt',
        props: { content: 'Do you approve these changes?' }
      },
      {
        type: 'note',
        props: {
          content: 'This will modify your existing authentication flow and add a new OAuth provider.',
          variant: 'info',
          label: 'Context'
        }
      },
      {
        type: 'approval',
        props: { requireReason: true, allowReason: true }
      }
    ],
  },
  {
    id: 'Message-mock-choice-multi' as any,
    entityType: 'Message' as any,
    text: 'Which testing frameworks would you like to set up? (Select all that apply)',
    sender: 'assistant' as const,
    timestamp: Date.now() - 6000,
    createdAt: Date.now() - 6000,
    blocks: [
      {
        type: 'prompt',
        props: { content: 'Select testing frameworks' }
      },
      {
        type: 'choice',
        props: {
          choices: [
            { id: 'jest', label: 'Jest', description: 'Popular JavaScript testing framework' },
            { id: 'vitest', label: 'Vitest', description: 'Vite-native testing framework' },
            { id: 'playwright', label: 'Playwright', description: 'End-to-end testing' },
            { id: 'cypress', label: 'Cypress', description: 'E2E testing framework' },
          ],
          multiSelect: true,
          allowCustom: false,
          displayText: 'Selected frameworks:'
        }
      }
    ],
  },
  {
    id: 'Message-mock-file-multi' as any,
    entityType: 'Message' as any,
    text: 'Please select the configuration files you want me to analyze.',
    sender: 'assistant' as const,
    timestamp: Date.now() - 5000,
    createdAt: Date.now() - 5000,
    blocks: [
      {
        type: 'prompt',
        props: { content: 'Select configuration files' }
      },
      {
        type: 'file-picker',
        props: { fileType: 'file', allowMultiple: true, displayText: 'Selected files:' }
      }
    ],
  },
  {
    id: 'Message-mock-text-input' as any,
    entityType: 'Message' as any,
    text: 'What would you like to name your new component?',
    sender: 'assistant' as const,
    timestamp: Date.now() - 4000,
    createdAt: Date.now() - 4000,
    blocks: [
      {
        type: 'prompt',
        props: { content: 'Enter component name' }
      },
      {
        type: 'note',
        props: {
          content: 'Use PascalCase (e.g., MyComponent)',
          variant: 'info'
        }
      },
      {
        type: 'text',
        props: {
          placeholder: 'MyComponent',
          required: true,
          displayText: 'Component name:'
        }
      }
    ],
  },
  {
    id: 'Message-mock-text-multiline' as any,
    entityType: 'Message' as any,
    text: 'Please provide additional context about the issue you\'re experiencing.',
    sender: 'assistant' as const,
    timestamp: Date.now() - 3000,
    createdAt: Date.now() - 3000,
    blocks: [
      {
        type: 'prompt',
        props: { content: 'Describe the issue in detail' }
      },
      {
        type: 'text',
        props: {
          placeholder: 'Enter description...',
          multiline: true,
          rows: 4,
          displayText: 'Response submitted'
        }
      }
    ],
  },
  {
    id: 'Message-mock-links' as any,
    entityType: 'Message' as any,
    text: 'I\'ve created several resources for your project. You can access them using the links below:',
    sender: 'assistant' as const,
    timestamp: Date.now() - 2000,
    createdAt: Date.now() - 2000,
    blocks: [
      {
        type: 'link',
        props: {
          links: [
            {
              label: 'View Project Plan',
              event: {
                target: 'agent',
                data: {
                  type: 'SELECT_ARTIFACT',
                  artifactId: 'Artifact-project-plan-123'
                }
              },
              icon: 'file-text'
            },
            {
              label: 'Open Related Thread',
              event: {
                target: 'agent',
                data: {
                  type: 'OPEN_THREAD_CHAT',
                  threadId: 'Thread-implementation-456'
                }
              },
              icon: 'message-square'
            },
            {
              label: 'Go to Library',
              event: {
                target: 'application',
                data: {
                  type: 'SELECT_PLUGIN',
                  pluginId: 'library'
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
        }
      }
    ],
  },
];
