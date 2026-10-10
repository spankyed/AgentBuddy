import * as path from 'node:path';
import { renderTemplate } from '../../templates.ts';
import { regenerateAfterScaffold } from '../generate-entries';
import { writeIfNotExists, logCreated, parseFlag, hasFlag } from './write';
import { readManifest, writeManifest, addMigration as addMigrationToManifest } from './manifest';

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
  // A migration targets a *release*: the runners read a prerelease as its release (`0.3.15-beta.2` runs the
  // `0.3.15` migrations), so a prerelease target is one nothing would ever match. The default comes from
  // the manifest's version, which during a beta is a prerelease, so it is normalised rather than refused.
  const asked = parseFlag(args, '--version') || args[0] || manifest.version || '0.0.0';
  const version = asked.replace(/[-+].*$/, '');
  if (version !== asked) console.log(`  ${asked} targets its release, ${version}`);
  const filePath = path.join(root, 'src', 'migrations', `${version}.ts`);

  // The manifest entry first: it is the declaration, and its key is the version the migration targets, so
  // a file no manifest names runs never. It refuses a version already declared rather than writing twice
  addMigrationToManifest(manifest, version, `src/migrations/${version}.ts#migration`);
  writeManifest(root, manifest);

  const created: string[] = [];
  if (writeIfNotExists(filePath, renderTemplate('pack/src/migrations/migration.ts', { VERSION: version }))) {
    created.push(filePath);
  }

  const regenerated = await regenerateAfterScaffold(root);

  console.log(`\nCreated migration targeting version "${version}":`);
  logCreated(root, created);
  console.log(`  ~ abuddy.json (migrations.${version})`);
  if (regenerated) console.log(`\n  __generated__/ regenerated`);
}
