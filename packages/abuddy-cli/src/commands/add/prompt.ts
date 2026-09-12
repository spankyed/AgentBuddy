import * as path from 'node:path';
import { validateName, toLabel, writeIfNotExists, logCreated, hasFlag } from './templates';

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

const HELP = `
Usage: abuddy add prompt <name>

Example:
  abuddy add prompt summarize-text
`.trim();

export async function addPrompt(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

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
