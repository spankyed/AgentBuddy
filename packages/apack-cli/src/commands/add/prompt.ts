import * as path from 'node:path';
import { validateName, toLabel, writeIfNotExists, logCreated, hasFlag } from './write';
import { renderTemplate } from '../../templates.ts';


const HELP = `
Usage: apack add prompt <name>

Example:
  apack add prompt summarize-text
`.trim();

export async function addPrompt(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const name = args[0];
  validateName(name, 'Prompt');

  const label = toLabel(name);
  const filePath = path.join(root, 'src', 'content', 'prompts', `${name}.ts`);

  const created: string[] = [];
  if (writeIfNotExists(filePath, renderTemplate('pack/src/content/prompts/prompt.ts', { LABEL: label }))) {
    created.push(filePath);
  }

  console.log(`\nCreated prompt "${name}":`);
  logCreated(root, created);
}
