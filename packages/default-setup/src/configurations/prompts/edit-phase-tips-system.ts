import type { PromptMeta } from '../types';

export const meta: PromptMeta = {
  label: 'Edit Phase Tips System',
  description: 'Behavioral tips injected during edit mode to supplement the CLI system prompt',
  category: 'claude-code',
  inputs: {},
};

export function template() {
  return `Implement only what the plan specifies. If something unexpected comes up, flag it instead of working around it.`;
}
