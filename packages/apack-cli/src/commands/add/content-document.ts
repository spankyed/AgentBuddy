// Writing a markdown document into a content source, shared by the two scaffolds that do it: a chat slash
// command and a library document. Both are the same act — markdown with `name` frontmatter, compiled by a
// format into Collection and Document records — and differ only in which format writes them and what the
// body holds.
import * as path from 'node:path';
import type { PackManifest } from '@apackdev/sdk/build';
import { writeManifest } from '../../manifest-writer.ts';
import { addContentSource } from './manifest';
import { logCreated, validateName, writeIfNotExists } from './write';

/** The pack that provides the formats a dependent writes this content with */
const PROVIDER = 'default-setup';

export interface DocumentTarget {
  /** The format's name, in this pack's `content.formats` or the provider's */
  format: string;
  /** The content key and default directory for a source this scaffold declares */
  key: string;
}

/**
 * The source already writing this format's documents, so a second document joins it rather than declaring
 * another entry. A dependent names the format `<provider>:<format>`, the provider names it bare.
 */
function existingSource(manifest: PackManifest, format: string): [string, string] | undefined {
  for (const [key, entry] of Object.entries(manifest.content?.sources ?? {})) {
    if (typeof entry === 'string' || !entry.format) continue;
    if (entry.format === format || entry.format.endsWith(`:${format}`)) return [key, entry.path ?? `src/content/${key}`];
  }
  return undefined;
}

/** This pack's own format, else the provider's, else nothing writes these documents */
function formatRef(manifest: PackManifest, format: string): string | undefined {
  if (manifest.content?.formats && Object.hasOwn(manifest.content.formats, format)) return format;
  return Object.hasOwn(manifest.dependencies ?? {}, PROVIDER) ? `${PROVIDER}:${format}` : undefined;
}

/**
 * Writes `body` as a document of `target`'s format, declaring the source when the pack has none, and
 * reports what it did. `folder` nests it, which the format reads as a Collection holding the document.
 *
 * Returns whether the document was written: a scaffold here never splices a file that is already there,
 * so a caller whose unit is smaller than a document (a command is one line of one) says what to add.
 */
export function writeContentDocument(
  root: string,
  manifest: PackManifest,
  target: DocumentTarget,
  options: { name: string; folder?: string; body: string },
): boolean {
  const existing = existingSource(manifest, target.format);
  const format = existing ? undefined : formatRef(manifest, target.format);
  if (!existing && !format) {
    throw new Error(`No content format writes "${target.format}" documents. Declare one in `
      + `\`content.formats\`, or depend on a pack that provides it ("${PROVIDER}") and run this again.`);
  }

  if (options.folder) validateName(options.folder, 'Folder');
  const sourcePath = existing ? existing[1] : `src/content/${target.key}`;
  const filePath = path.join(root, sourcePath, ...(options.folder ? [options.folder] : []), `${options.name}.md`);

  // The source first, as every scaffold declares what it writes: a document no entry compiles is content
  // the apply never reaches
  const declared = existing === undefined;
  if (declared) {
    addContentSource(manifest, target.key, { path: sourcePath, format: format! });
    writeManifest(root, manifest);
  }

  const wrote = writeIfNotExists(filePath, options.body);
  if (wrote) {
    logCreated(root, [filePath]);
    if (declared) console.log(`  ~ apack.json (content.sources.${target.key})`);
  }
  return wrote;
}
