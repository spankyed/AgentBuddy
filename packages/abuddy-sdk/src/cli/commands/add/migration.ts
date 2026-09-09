import * as path from 'node:path';
import { writeIfNotExists, logCreated, parseFlag } from './templates';
import { readManifest } from './manifest';

const MIGRATION_TEMPLATE = (version: string) => `import type { Migration } from '@abuddy/sdk/build';

export const migration: Migration = {
  target: '${version}',
  async up(db) {
    // Migration implementation
  },
};
`;

export async function addMigration(args: string[], root: string) {
  const manifest = readManifest(root);
  const version = parseFlag(args, '--version') || args[0] || manifest.version || '0.0.0';
  const fileName = version.replace(/\./g, '-');
  const filePath = path.join(root, 'src', 'migrations', `${fileName}.ts`);

  const created: string[] = [];
  if (writeIfNotExists(filePath, MIGRATION_TEMPLATE(version))) {
    created.push(filePath);
  }

  console.log(`\nCreated migration targeting version "${version}":`);
  logCreated(root, created);
}
