import * as path from 'node:path';
import { validateName, toLabel, writeIfNotExists, logCreated, parseFlag } from './templates';
import { readManifest } from './manifest';

const ACTION_TEMPLATE = (label: string, category: string) => `import type { ActionMeta } from '@abuddy/sdk/build';
import type { Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: '${label}',
  description: '',
  category: '${category}',
  input: {},
};

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  flowId: string,
) {
  // Action implementation
}
`;

export async function addAction(args: string[], root: string) {
  const name = args[0];
  validateName(name, 'Action');

  const manifest = readManifest(root);
  const category = parseFlag(args, '--category') || manifest.id;
  const label = toLabel(name);
  const filePath = path.join(root, 'src', 'seeds', 'actions', category, `${name}.ts`);

  const created: string[] = [];
  if (writeIfNotExists(filePath, ACTION_TEMPLATE(label, category))) {
    created.push(filePath);
  }

  console.log(`\nCreated action "${name}":`);
  logCreated(root, created);
}
