import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeIfNotExists, logCreated, parseFlag, hasFlag } from './templates';
import { readManifest, writeManifest } from './manifest';

const MIGRATION_TEMPLATE = (version: string) => `import type { Migration } from '@abuddy/sdk/build';

export const migration: Migration = {
  target: '${version}',
  async up(db) {
    // Migration implementation
  },
};
`;

const INDEX_TEMPLATE = (fileName: string, importName: string) => `import type { Migration } from '@abuddy/sdk/build';
import { migration as ${importName} } from './${fileName}';

export const migrations: Migration[] = [
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

function toImportName(fileName: string): string {
  return 'v' + fileName.replace(/-/g, '_');
}

export async function addMigration(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const manifest = readManifest(root);
  const version = parseFlag(args, '--version') || args[0] || manifest.version || '0.0.0';
  const fileName = version.replace(/\./g, '-');
  const filePath = path.join(root, 'src', 'migrations', `${fileName}.ts`);
  const importName = toImportName(fileName);

  const created: string[] = [];
  if (writeIfNotExists(filePath, MIGRATION_TEMPLATE(version))) {
    created.push(filePath);
  }

  const indexPath = path.join(root, 'src', 'migrations', 'index.ts');
  if (!fs.existsSync(indexPath)) {
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, INDEX_TEMPLATE(fileName, importName));
    created.push(indexPath);
  } else {
    let content = fs.readFileSync(indexPath, 'utf-8');
    if (!content.includes(`'./${fileName}'`)) {
      const lastImportIdx = content.lastIndexOf('\nimport ');
      if (lastImportIdx !== -1) {
        const endOfLastImport = content.indexOf('\n', lastImportIdx + 1);
        content = content.slice(0, endOfLastImport + 1)
          + `import { migration as ${importName} } from './${fileName}';\n`
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
