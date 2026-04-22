import type { PromptMeta } from '../types';

export const meta: PromptMeta = {
  label: 'Edit Phase Tips',
  description: 'Behavioral tips injected during edit mode to supplement the CLI system prompt',
  category: 'claude-code',
  inputs: {},
};

export function template() {
  return `Make minimal, targeted changes — avoid refactoring beyond scope. Prefer reusing existing utilities over introducing new abstractions.`;
}
