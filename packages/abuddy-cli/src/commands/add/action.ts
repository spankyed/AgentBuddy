import * as path from 'node:path';
import { validateName, toLabel, writeIfNotExists, logCreated, parseFlag, hasFlag } from './write';
import { renderTemplate } from '../../templates.ts';
import { readManifest } from './manifest';


const HELP = `
Usage: abuddy add action <name> [options]

Options:
  --category <category>    Action category (default: pack id)

Example:
  abuddy add action analyze-text --category analysis
`.trim();

export async function addAction(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const name = args[0];
  validateName(name, 'Action');

  const manifest = readManifest(root);
  const category = parseFlag(args, '--category') || manifest.id;
  const label = toLabel(name);
  const filePath = path.join(root, 'src', 'seeds', 'actions', category, `${name}.ts`);

  const created: string[] = [];
  if (writeIfNotExists(filePath, renderTemplate('pack/src/seeds/actions/action.ts', { LABEL: label, CATEGORY: category }))) {
    created.push(filePath);
  }

  console.log(`\nCreated action "${name}":`);
  logCreated(root, created);
}
