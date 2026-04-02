import type { PromptMeta } from '../types';

export const meta: PromptMeta = {
  label: 'db-query-examples',
  description: 'System prompt providing example code for generating database operations',
  category: 'database',
  inputs: {
    selectedDoc: { name: 'selectedDoc', type: 'string', required: true, description: 'Example code for the classified operation type' },
  },
};

export function template(params: Record<string, any>) {
  return `
<examples>
${params.selectedDoc}
</examples>

Use the provided examples to write the code to satisfy the user message. Only respond with code (no codeblock backticks).`;
}
