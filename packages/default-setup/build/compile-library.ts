import * as fs from 'fs';
import * as path from 'path';
import type { ExportedItem, ExportedLibrary } from './dsl-types';
import { toDisplayName, parseMarkdownSections, parseFrontmatter } from './library-utils';
import { sourceHash } from './compile-utils';

function walkDirectory(dir: string): ExportedItem[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const items: ExportedItem[] = [];

  for (const entry of entries) {
    if (entry.name === 'media' || entry.name === '_meta.md') continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      let name = toDisplayName(entry.name);
      let description: string | undefined;
      const metaPath = path.join(fullPath, '_meta.md');
      if (fs.existsSync(metaPath)) {
        const meta = parseFrontmatter(fs.readFileSync(metaPath, 'utf-8'));
        if (meta.name) name = meta.name;
        description = meta.description;
      }
      const children = walkDirectory(fullPath);
      const childHashes = children.map(c => 'sourceHash' in c ? c.sourceHash : null).filter(Boolean);
      items.push({
        type: 'collection',
        name,
        ...(description && { description }),
        children,
        sourceHash: sourceHash({ name, description, children: childHashes }),
      });
    } else if (entry.name.endsWith('.md')) {
      const text = fs.readFileSync(fullPath, 'utf-8');
      const { tags, name: fmName, body } = parseFrontmatter(text);
      const name = fmName || toDisplayName(entry.name.replace(/\.md$/, ''));
      const content = parseMarkdownSections(body || text);
      const resolvedTags = tags.length ? tags : ['default'];
      items.push({
        type: 'document',
        name,
        content,
        tags: resolvedTags,
        sourceHash: sourceHash({ name, content, tags: resolvedTags }),
      });
    }
  }

  return items;
}

export function compileLibraryFromDir(libraryDir: string): ExportedLibrary {
  if (!fs.existsSync(libraryDir)) {
    return { version: 1, items: [] };
  }
  return { version: 1, items: walkDirectory(libraryDir) };
}

export function copyLibraryMedia(libraryDir: string, outputDir: string): void {
  const mediaSrc = path.join(libraryDir, 'media');
  if (fs.existsSync(mediaSrc)) {
    const mediaDest = path.join(outputDir, 'media');
    fs.cpSync(mediaSrc, mediaDest, { recursive: true });
  }
}
