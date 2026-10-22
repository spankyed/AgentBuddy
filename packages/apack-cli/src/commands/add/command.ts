// Scaffolds a chat slash command, which is content: a document whose field section holds one
// `**name**: placeholder` line per command, written with a `commands` format. A pack serving its own
// commands plays the `commands` designation; a pack contributing them to whichever pack does — the usual
// case — only ships the documents, which is all this writes.
import * as path from 'node:path';
import { writeManifest } from '../../manifest-writer.ts';
import { renderTemplate } from '../../templates.ts';
import { addContentSource, readManifest } from './manifest';
import { hasFlag, logCreated, parseFlag, toLabel, validateName, writeIfNotExists } from './write';

const HELP = `
Usage: apack pack add command <name> [options]

Options:
  --placeholder <text>   What the chat shows after the command (default: "Arguments")
  --document <name>      The document to write it in (default: "commands")

Example:
  apack pack add command standup --placeholder "Topic"
`.trim();

/** A format of this pack's own, or a dependency's, that writes command documents */
function commandsFormat(manifest: ReturnType<typeof readManifest>): string | undefined {
  if (manifest.content?.formats && Object.hasOwn(manifest.content.formats, 'commands')) return 'commands';
  const dependency = Object.keys(manifest.dependencies ?? {}).find(id => id === 'default-setup');
  return dependency ? `${dependency}:commands` : undefined;
}

/** The entry already writing command documents, so a second command joins it rather than a new source */
function existingSource(manifest: ReturnType<typeof readManifest>): [string, string] | undefined {
  for (const [key, entry] of Object.entries(manifest.content?.sources ?? {})) {
    if (typeof entry === 'string' || !entry.format) continue;
    if (entry.format === 'commands' || entry.format.endsWith(':commands')) return [key, entry.path ?? `src/content/${key}`];
  }
  return undefined;
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

  const existing = existingSource(manifest);
  const format = existing ? undefined : commandsFormat(manifest);
  if (!existing && !format) {
    throw new Error('No content format writes command documents. Declare one in `content.formats`, '
      + 'or depend on a pack that does ("default-setup") and run this again.');
  }

  const sourcePath = existing ? existing[1] : 'src/content/commands';
  const filePath = path.join(root, sourcePath, `${documentName}.md`);

  // The source first, as every scaffold declares what it writes: a document no entry compiles is content
  // the apply never reaches
  const declared = existing === undefined;
  if (declared) {
    addContentSource(manifest, 'commands', { path: sourcePath, format: format! });
    writeManifest(root, manifest);
  }

  const created: string[] = [];
  const wrote = writeIfNotExists(filePath, renderTemplate('pack/src/content/commands/commands.md', {
    DOCUMENT_LABEL: toLabel(documentName), NAME: name, PLACEHOLDER: placeholder,
  }));
  if (wrote) created.push(filePath);

  // A command is a line in a document's field section, and a scaffold never splices a file that is there:
  // the author adds the next one themselves, which is also how they are edited in the app
  if (!wrote) {
    console.log(`\nThat document is already there. Add "/${name}" to its field section:`);
    console.log(`    **${name}**: ${placeholder}`);
    return;
  }

  console.log(`\nCreated command "/${name}":`);
  logCreated(root, created);
  if (declared) console.log('  ~ apack.json (content.sources.commands)');
}
