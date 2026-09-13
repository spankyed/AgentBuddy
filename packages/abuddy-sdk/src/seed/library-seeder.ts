import * as fs from 'fs';
import * as path from 'path';
import { repository } from '../ears/index.js';
import { findAll, findWhere } from '../ears/internals.js';
import { loadJSON, shouldSeedAll, type Seeder, type SeederContext, type SeedCounts, type ImportMode } from '../utils/index.js';
import { getMediaPath } from '../utils/index.js';
import { seedPath } from '../build/manifest.js';

const RELATIVE_MEDIA_RE = /!\[([^\]]*)\]\((media\/([^)]+))\)/g;

function restoreDocMedia(
  content: any[],
  docId: string,
  mediaDir: string,
  log: (...a: any[]) => void,
): { content: any[]; mediaCount: number } {
  let mediaCount = 0;
  const updated = content.map((section: any) => {
    if ((section.type === 'markdown' || section.type === 'text') && 'text' in section) {
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
  items: any[],
  parentId: any,
  counts: SeedCounts,
  log: (...a: any[]) => void,
  mediaDir: string,
  ears: any,
  mode?: ImportMode,
): void {
  const repo = repository as any;

  for (const item of items) {
    if (item.type === 'document') {
      const existing = findWhere(ears.Entity.Document, 'name', item.name)[0] as any;
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
      const existing = findWhere(ears.Entity.Collection, 'name', item.name)[0] as any;
      if (existing && mode === 'keep-existing') {
        counts.skipped++;
        log(`  library collection skipped (existing): ${item.name}`);
        continue;
      }
      let colId: any;
      if (existing) {
        if (shouldSkipByHash(existing.sourceHash, item.sourceHash)) {
          counts.skipped++;
          log(`  library collection skipped: ${item.name}`);
          seedLibraryTree(item.children, existing.id, counts, log, mediaDir, ears, mode);
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
      seedLibraryTree(item.children, colId, counts, log, mediaDir, ears, mode);
    }
  }
}

export function createLibrarySeeder(ears: any): Seeder {
  return {
    key: 'library',
    seed(ctx: SeederContext): SeedCounts {
      const repo = repository as any;
      const counts: SeedCounts = { created: 0, updated: 0, skipped: 0 };
      const libraryFile = seedPath(ctx.compiledDir, 'library');
      const libraryData: any = loadJSON(libraryFile);
      if (!libraryData) {
        ctx.log('  library artifact not found, skipping library');
        return counts;
      }
      const allItems = Array.isArray(libraryData) ? libraryData : libraryData.items;
      const items = shouldSeedAll(ctx.include)
        ? (allItems ?? [])
        : (allItems ?? []).filter((i: any) => (ctx.include as ReadonlySet<string>).has(i.name));
      if (ctx.mode === 'wipe-and-replace') {
        for (const d of findAll(ears.Entity.Document)) repo.libraryCommands.deleteDocument((d as any).id);
        for (const c of findAll(ears.Entity.Collection)) repo.libraryCommands.deleteCollection((c as any).id);
        ctx.log('  library wiped');
      }
      const mediaDir = path.join(ctx.compiledDir, 'media');
      seedLibraryTree(items, undefined, counts, ctx.log, mediaDir, ears, ctx.mode);
      return counts;
    },
  };
}
