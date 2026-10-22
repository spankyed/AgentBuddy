// Scaffolds a chat slash command, which is content: a document whose field section holds one
// `**name**: placeholder` line per command, written with a `commands` format. A pack serving its own
// commands plays the `commands` designation; a pack contributing them to whichever pack does — the usual
// case — only ships the documents, which is all this writes.
import { renderTemplate } from '../../templates.ts';
import { writeContentDocument } from './content-document.ts';
import { readManifest } from './manifest';
import { hasFlag, parseFlag, toLabel, validateName } from './write';

const HELP = `
Usage: apack pack add command <name> [options]

Options:
  --placeholder <text>   What the chat shows after the command (default: "Arguments")
  --document <name>      The document to write it in (default: "commands")
  --folder <name>        A folder under the source to nest it in

Example:
  apack pack add command standup --placeholder "Topic" --folder internal
`.trim();

export async function addCommand(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const name = args[0];
  validateName(name, 'Command');

  const manifest = readManifest(root);
  const placeholder = parseFlag(args, '--placeholder') || 'Arguments';
  const documentName = parseFlag(args, '--document') || 'commands';
  validateName(documentName, 'Document');

  const wrote = writeContentDocument(root, manifest, { format: 'commands', key: 'commands' }, {
    name: documentName,
    folder: parseFlag(args, '--folder'),
    body: renderTemplate('pack/src/content/commands/commands.md', {
      DOCUMENT_LABEL: toLabel(documentName), NAME: name, PLACEHOLDER: placeholder,
    }),
  });

  // A command is a line in a document's field section, and a scaffold never splices a file that is there:
  // the author adds the next one themselves, which is also how they are edited in the app
  if (!wrote) {
    console.log(`\nThat document is already there. Add "/${name}" to its field section:`);
    console.log(`    **${name}**: ${placeholder}`);
    return;
  }
  console.log(`\nCreated command "/${name}".`);
}
