import type { BlockDefinition } from '@abuddy/sdk/blocks';

export const standardBlocks: BlockDefinition[] = [
  {
    type: 'prompt',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/blocks/PromptBlock.vue').default,
    },
  },
  {
    type: 'note',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/blocks/NoteBlock.vue').default,
    },
  },
  {
    type: 'markdown',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/blocks/MarkdownBlock.vue').default,
    },
  },
  {
    type: 'link',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/blocks/LinkBlock.vue').default,
    },
  },
  {
    type: 'tool-activity',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/blocks/ToolActivityBlock.vue').default,
    },
  },
  {
    type: 'thinking',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/blocks/ThinkingBlock.vue').default,
    },
  },
  {
    type: 'tool-input',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/blocks/ToolInputBlock.vue').default,
    },
  },
  {
    type: 'context-usage',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/blocks/ContextUsageBlock.vue').default,
    },
  },
  {
    type: 'session-list',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/blocks/SessionListBlock.vue').default,
    },
  },
  {
    type: 'actions',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/blocks/ActionButtons.vue').default,
    },
  },
  {
    type: 'toggles',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/blocks/TogglesBlock.vue').default,
    },
  },
  {
    type: 'file-picker',
    kind: 'input',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/inputs/FilePickerInput.vue').default,
    },
  },
  {
    type: 'choice',
    kind: 'input',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/inputs/ChoiceInput.vue').default,
    },
  },
  {
    type: 'text',
    kind: 'input',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/inputs/TextInput.vue').default,
    },
  },
  {
    type: 'approval',
    kind: 'input',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/inputs/ApprovalButtons.vue').default,
    },
  },
  {
    type: 'button-group',
    kind: 'input',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/inputs/ButtonGroupInput.vue').default,
    },
  },
  {
    type: 'question',
    kind: 'input',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/inputs/QuestionInput.vue').default,
    },
  },
  {
    type: 'project-select',
    kind: 'input',
    fe: {
      loadComponent: () => require('../plugins/threads/fe/chat/interactions/inputs/ProjectSelectInput.vue').default,
    },
  },
];
