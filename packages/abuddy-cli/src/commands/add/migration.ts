import * as path from 'node:path';
import { renderTemplate } from '../../templates.ts';
import { regenerateAfterScaffold } from '../generate-entries';
import { writeIfNotExists, logCreated, parseFlag, hasFlag } from './write';
import type { MigrationLine } from '@abuddy/sdk/build';
import { readManifest, writeManifest, addMigration as addMigrationToManifest } from './manifest';

const HELP = `
Usage: abuddy add migration [version] [options]

Options:
  --version <version>    Target version (default: this pack's version)
  --app                  Target AgentBuddy's version line instead of this pack's

A migration's version line says what its target is a version of. By default that is this pack's own
\`version\`, which is what moves when the pack does. --app puts it on AgentBuddy's release line, for data
whose shape follows the app rather than the pack. Either way a target is a release — three numbers — and a
prerelease is normalised to the release it belongs to.

Example:
  abuddy add migration 0.2.0
  abuddy add migration --version 0.2.0
  abuddy add migration 0.3.16 --app
`.trim();

export async function addMigration(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const manifest = readManifest(root);
  // The pack's own line is the default, since a pack's data usually moves when the pack does — and because
  // the app's line is a third party putting code on AgentBuddy's versions, which should be asked for
  const line: MigrationLine = hasFlag(args, '--app') ? 'app' : 'pack';
  const asked = parseFlag(args, '--version') || args[0] || manifest.version || '0.0.0';
  // A migration targets a *release*, on either line: the manifest key is three numbers and nothing else, and
  // the app's runner reads a prerelease as its release (`0.3.15-beta.2` runs the `0.3.15` migrations), so a
  // prerelease target is one nothing would ever match. The default is the manifest's version, which during
  // a beta is a prerelease, so it is normalised rather than refused
  const version = asked.replace(/[-+].*$/, '');
  if (version !== asked) console.log(`  ${asked} targets its release, ${version}`);
  const filePath = path.join(root, 'src', 'migrations', `${version}.ts`);

  // The manifest entry first: it is the declaration, its key is the version the migration targets and the
  // map it goes in is the line that version is on, so a file no manifest names runs never. It refuses a
  // version already declared on that line rather than writing twice
  addMigrationToManifest(manifest, line, version, `src/migrations/${version}.ts#migration`);
  writeManifest(root, manifest);

  const created: string[] = [];
  if (writeIfNotExists(filePath, renderTemplate('pack/src/migrations/migration.ts', { VERSION: version }))) {
    created.push(filePath);
  }

  const regenerated = await regenerateAfterScaffold(root);

  const lineSays = line === 'app' ? "AgentBuddy's version" : "this pack's version";
  console.log(`\nCreated migration targeting ${lineSays} "${version}":`);
  logCreated(root, created);
  console.log(`  ~ abuddy.json (migrations.${line}.${version})`);
  if (regenerated) console.log(`\n  __generated__/ regenerated`);
}
