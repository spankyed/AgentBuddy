import * as path from 'node:path';
import { validateName, toLabel, writeIfNotExists, logCreated } from './templates';

const FLOW_TEMPLATE = (label: string) => `import type { FlowDSL } from '@abuddy/sdk/build';
import { entry, on, keepAlive } from '#generated/flow-helpers';

export default {
  "${label}": [
    entry([keepAlive()]),
  ],
} satisfies FlowDSL;
`;

export async function addFlow(args: string[], root: string) {
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
