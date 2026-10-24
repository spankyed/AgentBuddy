// Scaffolds a document: markdown compiled by the SDK's `documents` key into a Document the user reads and
// edits, with directories under the source becoming the folders holding them.
import { renderTemplate } from '../../templates.ts';
import { writeContentDocument } from './content-document.ts';
import { readManifest } from './manifest';
import { hasFlag, parseFlag, toLabel, validateName } from './write';

const HELP = `
Usage: apack pack add document <name> [options]

Options:
  --content <text>    The document's body, written as it is given
  --section <type>    The section the body goes in (default: "text")
  --folder <name>     A folder under the source to nest it in
  --tag <tag>         The document's tag (default: "default")

Example:
  apack pack add document getting-started --folder guides --content "Install the pack, then open Threads."
`.trim();

/** What the body says when the caller gave none: the convention a reader needs to write the rest */
const EXPLAIN = `Write the document here. A \`<!-- section:<type> -->\` marker starts a section; the editor reads each
one as its own block, so a document can hold several.`;

export async function addDocument(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const name = args[0];
  validateName(name, 'Document');

  const manifest = readManifest(root);
  const section = parseFlag(args, '--section') || 'text';
  validateName(section, 'Section');
  const { wrote } = writeContentDocument(root, manifest, 'documents', {
    name,
    folder: parseFlag(args, '--folder'),
    body: renderTemplate('pack/src/content/documents/document.md', {
      LABEL: toLabel(name), TAG: parseFlag(args, '--tag') || 'default',
      SECTION: section, BODY: parseFlag(args, '--content') || EXPLAIN,
    }),
  });

  if (!wrote) {
    console.log(`\nThat document is already there; nothing written.`);
    return;
  }
  console.log(`\nCreated document "${toLabel(name)}".`);
}
