import type { PromptMeta } from '../types';

export const meta: PromptMeta = {
  label: 'Plan Phase Tips',
  description: 'Behavioral tips injected during plan mode to supplement the CLI system prompt',
  category: 'claude-code',
  inputs: {},
};

export function template() {
  return `If the user's message is unrelated to the planning task, handle it directly. Take the user's request literally before reinterpreting through prior context. Use the simplest tool for the job — don't launch agents when a single Read/Grep suffices.`;
}
