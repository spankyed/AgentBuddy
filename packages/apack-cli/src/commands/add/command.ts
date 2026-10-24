// Scaffolds a chat slash command, which is content: a document whose field section holds one
// `**name**: placeholder` line per command, compiled by the SDK's `commands` key. The app serves every such
// document from its own rows, so shipping the document is all a pack does to contribute a command.
import * as fs from 'node:fs';
import * as path from 'node:path';
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

/** A field section's marker, which is what holds `**name**: placeholder` lines */
const FIELD_MARKER = /<!-- section:field(?::\w+)? -->/;
/** Any section's marker, so a field section's span is known to end where the next one starts */
const ANY_MARKER = /<!-- section:\w+(?::\w+)? -->/g;

/**
 * Adds one `**name**: placeholder` line to a document's field section.
 *
 * The one place a scaffold here writes into a file that is already there, and it is a line appended to a
 * list rather than a rewrite: a command *is* one such line, so creating a document per command would be
 * the odd outcome. It refuses a document with no field section and a name the section already defines,
 * because both mean the caller is describing a document other than the one on disk.
 */
function appendField(body: string, name: string, placeholder: string): string {
  const marker = body.match(FIELD_MARKER);
  if (marker?.index === undefined) {
    throw new Error('That document has no `<!-- section:field -->` section, so it holds no commands. '
      + 'Name another document with --document, or add the section to this one.');
  }
  const from = marker.index + marker[0].length;
  const next = [...body.matchAll(ANY_MARKER)].find(m => m.index! >= from);
  const until = next?.index ?? body.length;

  const section = body.slice(from, until);
  if (new RegExp(`^\\*\\*${name}\\*\\*:`, 'm').test(section)) {
    throw new Error(`That document already defines "/${name}".`);
  }

  const line = `**${name}**: ${placeholder}\n`;
  const kept = section.replace(/\s*$/, '\n');
  return body.slice(0, from) + kept + line + body.slice(until);
}

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

  const { wrote, filePath } = writeContentDocument(root, manifest, 'commands', {
    name: documentName,
    folder: parseFlag(args, '--folder'),
    body: renderTemplate('pack/src/content/commands/commands.md', {
      DOCUMENT_LABEL: toLabel(documentName), NAME: name, PLACEHOLDER: placeholder,
    }),
  });

  // The document was already there, so the command joins its field section rather than becoming a
  // document of its own — which is what lets a caller add several without editing markdown in between
  if (!wrote) {
    fs.writeFileSync(filePath, appendField(fs.readFileSync(filePath, 'utf-8'), name, placeholder));
    console.log(`  ~ ${path.relative(root, filePath)}`);
  }
  console.log(`\nCreated command "/${name}".`);
}
