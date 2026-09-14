import { EARS } from '../types/entities.ts';
import type { CollectionEntity, ContentSection, DocumentEntity } from '../types/sdk-entities.ts';
import type { ExportedItem } from '../build/compilers/compile-library.ts';
import * as fs from 'fs';
import * as path from 'path';
import { builtinRepository } from '../ears/builtin-repositories.ts';
import { findAll, findWhere } from '../ears/query-helpers.ts';
import { loadJSON, shouldSeedAll, type Seeder, type SeederContext, type SeedCounts, type ImportMode } from '../utils/index.ts';
import { getMediaPath } from '../utils/index.ts';
import { seedPath } from '../build/manifest.ts';

const RELATIVE_MEDIA_RE = /!\[([^\]]*)\]\((media\/([^)]+))\)/g;

function restoreDocMedia(
  content: ContentSection[],
  docId: string,
  mediaDir: string,
  log: (...a: unknown[]) => void,
): { content: ContentSection[]; mediaCount: number } {
  let mediaCount = 0;
  const updated = content.map((section): ContentSection => {
    if (section.type === 'markdown' || section.type === 'text') {
      let text = section.text;
      for (const match of section.text.matchAll(RELATIVE_MEDIA_RE)) {
        const filename = match[3];
        const srcFile = path.join(mediaDir, filename);
        if (!fs.existsSync(srcFile)) continue;
        const destDir = path.join(getMediaPath(), docId);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(srcFile, path.join(destDir, filename));
        text = text.split(`media/${filename}`).join(`media://${docId}/${filename}`);
        mediaCount++;
        log(`    media copied: ${filename}`);
      }
      return { ...section, text };
    }
    return section;
  });
  return { content: updated, mediaCount };
}

function shouldSkipByHash(existingHash: string | undefined, compiledHash: string | undefined): boolean {
  if (!existingHash) return true;
  return !!compiledHash && existingHash === compiledHash;
}

function seedLibraryTree(
  items: ExportedItem[],
  parentId: EARS.EntityId | undefined,
  counts: SeedCounts,
  log: (...a: unknown[]) => void,
  mediaDir: string,
  mode?: ImportMode,
): void {
  const repo = builtinRepository;

  for (const item of items) {
    if (item.type === 'document') {
      const existing = findWhere<DocumentEntity>(EARS.Entity.Document, 'name', item.name)[0];
      if (existing && mode === 'keep-existing') {
        counts.skipped++;
        log(`  library doc skipped (existing): ${item.name}`);
        continue;
      }
      if (existing) {
        if (shouldSkipByHash(existing.sourceHash, item.sourceHash)) {
          counts.skipped++;
          log(`  library doc skipped: ${item.name}`);
          continue;
        }
        const { content } = restoreDocMedia(item.content, existing.id, mediaDir, log);
        repo.libraryCommands.updateDocument(existing.id, item.name, content, item.tags ?? [], undefined, item.sourceHash);
        counts.updated++;
        log(`  library doc updated: ${item.name}`);
      } else {
        const doc = repo.libraryCommands.createDocument(item.name, item.content, item.tags ?? [], parentId, undefined, item.sourceHash);
        const { content, mediaCount } = restoreDocMedia(item.content, doc.id, mediaDir, log);
        if (mediaCount > 0) {
          repo.libraryCommands.updateDocument(doc.id, item.name, content, item.tags ?? [], undefined, item.sourceHash);
        }
        counts.created++;
        log(`  library doc created: ${item.name}`);
      }
    } else if (item.type === 'collection') {
      const existing = findWhere<CollectionEntity>(EARS.Entity.Collection, 'name', item.name)[0];
      if (existing && mode === 'keep-existing') {
        counts.skipped++;
        log(`  library collection skipped (existing): ${item.name}`);
        continue;
      }
      let colId: EARS.EntityId;
      if (existing) {
        if (shouldSkipByHash(existing.sourceHash, item.sourceHash)) {
          counts.skipped++;
          log(`  library collection skipped: ${item.name}`);
          seedLibraryTree(item.children, existing.id, counts, log, mediaDir, mode);
          continue;
        }
        colId = existing.id;
        repo.libraryCommands.updateCollection(colId, item.name, item.description, item.sourceHash);
        counts.updated++;
        log(`  library collection updated: ${item.name}`);
      } else {
        const col = repo.libraryCommands.createCollection(item.name, item.description, parentId, undefined, item.sourceHash);
        colId = col.id;
        counts.created++;
        log(`  library collection created: ${item.name}`);
      }
      seedLibraryTree(item.children, colId, counts, log, mediaDir, mode);
    }
  }
}

export function createLibrarySeeder(): Seeder {
  return {
    key: 'library',
    seed(ctx: SeederContext): SeedCounts {
      const counts: SeedCounts = { created: 0, updated: 0, skipped: 0 };
      const libraryFile = seedPath(ctx.compiledDir, 'library');
      const libraryData = loadJSON<ExportedItem[] | { items?: ExportedItem[] }>(libraryFile);
      if (!libraryData) {
        ctx.log('  library artifact not found, skipping library');
        return counts;
      }
      const allItems = Array.isArray(libraryData) ? libraryData : libraryData.items;
      const items = shouldSeedAll(ctx.include)
        ? (allItems ?? [])
        : (allItems ?? []).filter((i) => (ctx.include as ReadonlySet<string>).has(i.name));
      if (ctx.mode === 'wipe-and-replace') {
        for (const d of findAll<DocumentEntity>(EARS.Entity.Document)) builtinRepository.libraryCommands.deleteDocument(d.id);
        for (const c of findAll<CollectionEntity>(EARS.Entity.Collection)) builtinRepository.libraryCommands.deleteCollection(c.id);
        ctx.log('  library wiped');
      }
      const mediaDir = path.join(ctx.compiledDir, 'media');
      seedLibraryTree(items, undefined, counts, ctx.log, mediaDir, ctx.mode);
      return counts;
    },
  };
}
