import type { BlockDefinition } from '@abuddy/sdk/blocks';

export const standardBlocks: BlockDefinition[] = [
  {
    type: 'prompt',
    fe: {
      loadComponent: () => require('./display/PromptBlock.vue').default,
    },
  },
  {
    type: 'note',
    fe: {
      loadComponent: () => require('./display/NoteBlock.vue').default,
    },
  },
  {
    type: 'markdown',
    fe: {
      loadComponent: () => require('./display/MarkdownBlock.vue').default,
    },
  },
  {
    type: 'link',
    fe: {
      loadComponent: () => require('./display/LinkBlock.vue').default,
    },
  },
  {
    type: 'tool-activity',
    fe: {
      loadComponent: () => require('./display/ToolActivityBlock.vue').default,
    },
  },
  {
    type: 'thinking',
    fe: {
      loadComponent: () => require('./display/ThinkingBlock.vue').default,
    },
  },
  {
    type: 'tool-input',
    fe: {
      loadComponent: () => require('./display/ToolInputBlock.vue').default,
    },
  },
  {
    type: 'context-usage',
    fe: {
      loadComponent: () => require('./display/ContextUsageBlock.vue').default,
    },
  },
  {
    type: 'session-list',
    fe: {
      loadComponent: () => require('./display/SessionListBlock.vue').default,
    },
  },
  {
    type: 'actions',
    fe: {
      loadComponent: () => require('./display/ActionButtons.vue').default,
    },
  },
  {
    type: 'toggles',
    fe: {
      loadComponent: () => require('./display/TogglesBlock.vue').default,
    },
  },
  {
    type: 'file-picker',
    kind: 'input',
    fe: {
      loadComponent: () => require('./input/FilePickerInput.vue').default,
    },
  },
  {
    type: 'choice',
    kind: 'input',
    fe: {
      loadComponent: () => require('./input/ChoiceInput.vue').default,
    },
  },
  {
    type: 'text',
    kind: 'input',
    fe: {
      loadComponent: () => require('./input/TextInput.vue').default,
    },
  },
  {
    type: 'approval',
    kind: 'input',
    fe: {
      loadComponent: () => require('./input/ApprovalButtons.vue').default,
    },
  },
  {
    type: 'button-group',
    kind: 'input',
    fe: {
      loadComponent: () => require('./input/ButtonGroupInput.vue').default,
    },
  },
  {
    type: 'question',
    kind: 'input',
    fe: {
      loadComponent: () => require('./input/QuestionInput.vue').default,
    },
  },
  {
    type: 'project-select',
    kind: 'input',
    fe: {
      loadComponent: () => require('./input/ProjectSelectInput.vue').default,
    },
  },
];
