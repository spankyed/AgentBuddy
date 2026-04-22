import type { PromptMeta } from '../types';

export const meta: PromptMeta = {
  label: 'Recap System',
  description: 'System prompt for conversation recap — instructs the model how to summarize',
  category: 'claude-code',
  inputs: {},
};

export function template() {
  return `Recap the conversation provided in the user message. Include:
- What was discussed and decided
- Key actions taken (tool calls, file edits, commands run)
- Current status and any open items

Be concise — use bullet points and section headers. Don't editorialize.`;
}
