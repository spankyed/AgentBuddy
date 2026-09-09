import * as path from 'node:path';
import { writeIfNotExists, logCreated, parseFlag, hasFlag } from './templates';
import { readManifest } from './manifest';

const MIGRATION_TEMPLATE = (version: string) => `import type { Migration } from '@abuddy/sdk/build';

export const migration: Migration = {
  target: '${version}',
  async up(db) {
    // Migration implementation
  },
};
`;

const HELP = `
Usage: abuddy add migration [version] [options]

Options:
  --version <version>    Target version (default: current manifest version)

Example:
  abuddy add migration 0.2.0
  abuddy add migration --version 0.2.0
`.trim();

export async function addMigration(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

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
