import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderTemplate } from '../../templates.ts';
import { validateName, toLabel, writeIfNotExists, logCreated, hasFlag } from './write';


const HELP = `
Usage: abuddy add flow <name>

Example:
  abuddy add flow onboarding
`.trim();

export async function addFlow(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const name = args[0];
  validateName(name, 'Flow');

  // Flow steps come from dependencies (e.g. default-setup); codegen emits a helper per step type
  const helpers = path.join(root, 'src', '__generated__', 'flow-helpers.ts');
  if (!fs.existsSync(helpers) || !/\bkeepAlive\b/.test(fs.readFileSync(helpers, 'utf-8'))) {
    console.error(
      'Flows are built from step types that dependencies provide, and this pack has none yet.\n' +
      'Add one to abuddy.json, e.g. "dependencies": { "default-setup": "*" }, run "abuddy generate-entries",\n' +
      'then run "abuddy add flow" again.',
    );
    process.exit(1);
  }

  const label = toLabel(name);
  const filePath = path.join(root, 'src', 'content', 'flows', `${name}.ts`);

  const created: string[] = [];
  if (writeIfNotExists(filePath, renderTemplate('pack/src/content/flows/flow.ts', { LABEL: label }))) {
    created.push(filePath);
  }

  console.log(`\nCreated flow "${name}":`);
  logCreated(root, created);
}
