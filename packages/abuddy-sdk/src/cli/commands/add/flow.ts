import * as path from 'node:path';
import { validateName, toLabel, writeIfNotExists, logCreated, hasFlag } from './templates';

const FLOW_TEMPLATE = (label: string) => `import type { FlowDSL } from '@abuddy/sdk/build';
import { entry, on } from '#generated/flow-helpers';

export default {
  "${label}": [
    entry([]),
  ],
} satisfies FlowDSL;
`;

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

  const label = toLabel(name);
  const filePath = path.join(root, 'src', 'seeds', 'flows', `${name}.ts`);

  const created: string[] = [];
  if (writeIfNotExists(filePath, FLOW_TEMPLATE(label))) {
    created.push(filePath);
  }

  console.log(`\nCreated flow "${name}":`);
  logCreated(root, created);
}
