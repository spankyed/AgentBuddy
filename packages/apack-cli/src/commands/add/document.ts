// Scaffolds a library document: markdown compiled by a `library` format into a Document the user reads and
// edits in the Library, with directories under the source becoming the folders holding them.
import { renderTemplate } from '../../templates.ts';
import { writeContentDocument } from './content-document.ts';
import { readManifest } from './manifest';
import { hasFlag, parseFlag, toLabel, validateName } from './write';

const HELP = `
Usage: apack pack add document <name> [options]

Options:
  --folder <name>   A folder under the source to nest it in
  --tag <tag>       The document's tag (default: "default")

Example:
  apack pack add document getting-started --folder guides
`.trim();

export async function addDocument(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const name = args[0];
  validateName(name, 'Document');

  const manifest = readManifest(root);
  const wrote = writeContentDocument(root, manifest, { format: 'library', key: 'library' }, {
    name,
    folder: parseFlag(args, '--folder'),
    body: renderTemplate('pack/src/content/library/document.md', {
      LABEL: toLabel(name), TAG: parseFlag(args, '--tag') || 'default',
    }),
  });

  if (wrote) console.log(`\nCreated library document "${toLabel(name)}".`);
}
