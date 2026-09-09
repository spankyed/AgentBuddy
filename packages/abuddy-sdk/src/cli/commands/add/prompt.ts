import * as path from 'node:path';
import { validateName, toLabel, writeIfNotExists, logCreated } from './templates';

const PROMPT_TEMPLATE = (label: string) => `import type { PromptMeta } from '@abuddy/sdk/build';

export const meta: PromptMeta = {
  label: '${label}',
  description: '',
  category: 'general',
  inputs: {},
};

export function template(params: Record<string, any>) {
  return '';
}
`;

export async function addPrompt(args: string[], root: string) {
  const name = args[0];
  validateName(name, 'Prompt');

  const label = toLabel(name);
  const filePath = path.join(root, 'src', 'seeds', 'prompts', `${name}.ts`);

  const created: string[] = [];
  if (writeIfNotExists(filePath, PROMPT_TEMPLATE(label))) {
    created.push(filePath);
  }

  console.log(`\nCreated prompt "${name}":`);
  logCreated(root, created);
}
