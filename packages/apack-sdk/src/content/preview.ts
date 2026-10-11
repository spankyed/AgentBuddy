import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ContentIndex } from '../build/content-compiler.ts';
import type { PackContentPreview } from '../build/preview.ts';
import { indexPackId, registeredContentKeys, CONTENT_INDEX_FILE } from '../utils/apply.ts';

export type { PackContentPreview, PackContentPreviewItem } from '../build/preview.ts';

/**
 * What a compiled content directory would import: the keys it writes that the compiling pack registered
 * appliers for, and their items, from content.json. Throws when that pack registered no appliers (it
 * isn't installed), since importCompiledContent would import nothing.
 */
export function previewPackContent(directory: string): PackContentPreview {
  const indexFile = path.join(directory, CONTENT_INDEX_FILE);
  if (!fs.existsSync(indexFile)) {
    throw new Error(`${directory} has no ${CONTENT_INDEX_FILE}: choose a pack's compiled content directory (built by apack build)`);
  }
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8')) as ContentIndex;
  const packId = indexPackId(index, indexFile);
  const registered = new Set(registeredContentKeys(packId));
  if (registered.size === 0) {
    throw new Error(`Pack "${packId}" isn't installed, so its content can't be imported: install the pack first`);
  }
  const written = index.entries.filter((entry) => entry.written);
  return {
    directory,
    packId,
    content: Object.fromEntries(written.filter((entry) => registered.has(entry.key)).map((entry) => [entry.key, entry.items])),
    unavailable: written.filter((entry) => !registered.has(entry.key)).map((entry) => entry.key),
  };
}
