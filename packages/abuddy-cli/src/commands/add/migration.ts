import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeIfNotExists, logCreated, parseFlag, hasFlag } from './templates';
import { readManifest, writeManifest } from './manifest';

// Runs once when the pack updates past `target`; `up` is synchronous and must be safe to run again
const MIGRATION_TEMPLATE = (version: string) => `import type { PackMigration } from '@abuddy/sdk/framework';

export const migration: PackMigration = {
  target: '${version}',
  description: 'Describe what this migration changes',
  up: () => {
    // Check whether the change is needed before applying it
  },
};
`;

const INDEX_TEMPLATE = (fileName: string, importName: string) => `import type { PackMigration } from '@abuddy/sdk/framework';
import { migration as ${importName} } from './${fileName}';

export const migrations: PackMigration[] = [
  ${importName},
];
`;

const HELP = `
Usage: abuddy add migration [version] [options]

Options:
  --version <version>    Target version (default: current manifest version)

Example:
  abuddy add migration 0.2.0
  abuddy add migration --version 0.2.0
`.trim();

function toImportName(version: string): string {
  return 'v' + version.replace(/\./g, '_');
}

export async function addMigration(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const manifest = readManifest(root);
  const version = parseFlag(args, '--version') || args[0] || manifest.version || '0.0.0';
  const filePath = path.join(root, 'src', 'migrations', `${version}.ts`);
  const importName = toImportName(version);

  const created: string[] = [];
  if (writeIfNotExists(filePath, MIGRATION_TEMPLATE(version))) {
    created.push(filePath);
  }

  const indexPath = path.join(root, 'src', 'migrations', 'index.ts');
  if (!fs.existsSync(indexPath)) {
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, INDEX_TEMPLATE(version, importName));
    created.push(indexPath);
  } else {
    let content = fs.readFileSync(indexPath, 'utf-8');
    if (!content.includes(`'./${version}'`)) {
      const lastImportIdx = content.lastIndexOf('\nimport ');
      if (lastImportIdx !== -1) {
        const endOfLastImport = content.indexOf('\n', lastImportIdx + 1);
        content = content.slice(0, endOfLastImport + 1)
          + `import { migration as ${importName} } from './${version}';\n`
          + content.slice(endOfLastImport + 1);
      }
      const arrayCloseIdx = content.lastIndexOf('];');
      if (arrayCloseIdx !== -1) {
        content = content.slice(0, arrayCloseIdx) + `  ${importName},\n` + content.slice(arrayCloseIdx);
      }
      fs.writeFileSync(indexPath, content);
    }
  }

  const updatedManifest = !manifest.migrations;
  if (updatedManifest) {
    manifest.migrations = 'src/migrations/index.ts';
    writeManifest(root, manifest);
  }

  console.log(`\nCreated migration targeting version "${version}":`);
  logCreated(root, created);
  if (updatedManifest) console.log(`\n  manifest updated with migrations path`);
  console.log(`\n  migrations/index.ts updated`);
}
