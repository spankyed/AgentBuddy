import type { PromptMeta } from '../../types';

export const meta: PromptMeta = {
  label: 'Hermes System',
  description: 'System prompt for Hermes agent sessions',
  category: 'hermes',
  inputs: {
    persona: { name: 'persona', type: 'string', description: 'Persona from SOUL.md', required: false },
    workspace: { name: 'workspace', type: 'string', description: 'Current workspace directory', required: false },
  },
};

export function template(params: Record<string, any>): string {
  const parts = [];

  if (params.persona) {
    parts.push(params.persona);
  }

  if (params.workspace) {
    parts.push(`Working directory: ${params.workspace}`);
  }

  return parts.join('\n\n');
}
