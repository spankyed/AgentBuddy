import type { BlockDefinition } from '@abuddy/sdk/blocks';

export const blocks: BlockDefinition[] = [
  { type: 'prompt' },
  { type: 'note' },
  { type: 'markdown' },
  { type: 'link' },
  { type: 'tool-activity' },
  { type: 'thinking' },
  { type: 'tool-input' },
  { type: 'context-usage' },
  { type: 'session-list' },
  { type: 'actions', kind: 'input' },
  { type: 'toggles', kind: 'input' },
  { type: 'file-picker', kind: 'input' },
  { type: 'choice', kind: 'input' },
  { type: 'text', kind: 'input' },
  { type: 'approval', kind: 'input' },
  { type: 'button-group', kind: 'input' },
  { type: 'question', kind: 'input' },
  { type: 'project-select', kind: 'input' },
];
