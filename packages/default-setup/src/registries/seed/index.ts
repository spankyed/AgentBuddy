/**
 * Default-setup seeders — registers the built-in artifact seeders
 * (actions, prompts, flows, library, notes, settings) with the core
 * seed registry so they run when seedData() is called.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { EARS } from '@/registries/ears';
import { findById, findWhere, findAll } from '@abuddy/sdk/ears';
import { repository } from '@abuddy/sdk/ears';
import {
  registerSeeder, seedData, seedCollection, loadJSON, shouldSeedAll,
  type SeedCounts, type SeedIncludeSet, type ImportMode, type SeederContext,
} from '@abuddy/sdk/utils';
import { validate, compile, isFlowConfig } from '../../features/flows/be/dsl';
import { importNotesFromData } from '../../features/notes/be/import-notes';
import type { ActionEntity } from '../../features/actions/be/types';
import type { PromptEntity } from '../../features/prompts/be/types';
import type { FlowDSL } from '../../features/flows/be/dsl';
import type { FlowEntity } from '../../features/flows/be/config/types';
import type { ContentSection, Document, Collection } from '../../features/library/be/types';
import type { ExportedLibrary, ExportedItem } from '../../features/library/be/export-types';
import { getMediaPath } from '@abuddy/sdk/utils';
import type { ExportedNotes } from '../../features/notes/be/export-types';

function repo() {
  return repository;
}

export { seedData, loadJSON };
export type { SeedCounts, SeedIncludeSet, ImportMode };

export const DEFAULT_COMPILED_DIR = path.resolve(process.cwd(), '..', 'default-setup', 'dist');

// ── Seeder: actions ──────────────────────────────────────────────────

interface CompiledAction {
  label: string;
  description: string;
  category: string;
  input: any;
  actionFn: string;
  output: any;
  sourceHash?: string;
}

registerSeeder({
  key: 'actions',
  seed(ctx: SeederContext): SeedCounts {
    return seedCollection<CompiledAction>({
      file: path.join(ctx.compiledDir, 'compiled-actions.json'),
      label: 'action',
      getKey: item => item.label,
      findExisting: item => findWhere<ActionEntity>(EARS.Entity.Action, 'label', item.label)[0],
      create: item => repo().actionCommands.create({
        label: item.label, description: item.description, category: item.category,
        input: item.input, actionFn: item.actionFn, output: item.output,
        sourceHash: item.sourceHash,
      }),
      update: (id, item) => repo().actionCommands.update(id, {
        description: item.description, category: item.category,
        input: item.input, actionFn: item.actionFn, output: item.output,
        sourceHash: item.sourceHash,
      }),
      log: ctx.log,
      include: ctx.include,
      mode: ctx.mode,
      wipe: () => { for (const e of findAll<ActionEntity>(EARS.Entity.Action)) repo().actionCommands.delete(e.id); },
      getSourceHash: item => item.sourceHash,
      getExistingSourceHash: existing => findById<ActionEntity>(existing.id)?.sourceHash,
    });
  },
});

// ── Seeder: prompts ──────────────────────────────────────────────────

interface CompiledPrompt {
  label: string;
  description: string;
  category: string;
  inputs: any;
  templateFn: string;
  sourceHash?: string;
}

registerSeeder({
  key: 'prompts',
  seed(ctx: SeederContext): SeedCounts {
    return seedCollection<CompiledPrompt>({
      file: path.join(ctx.compiledDir, 'compiled-prompts.json'),
      label: 'prompt',
      getKey: item => item.label,
      findExisting: item => repo().promptQueries.byLabel(item.label) ?? undefined,
      create: item => repo().promptCommands.create({
        label: item.label, description: item.description, category: item.category,
        inputs: item.inputs, templateFn: item.templateFn,
        sourceHash: item.sourceHash,
      }),
      update: (id, item) => repo().promptCommands.update(id, {
        label: item.label, description: item.description, category: item.category,
        inputs: item.inputs, templateFn: item.templateFn,
        sourceHash: item.sourceHash,
      }),
      log: ctx.log,
      include: ctx.include,
      mode: ctx.mode,
      wipe: () => { for (const e of repo().promptQueries.all()) repo().promptCommands.delete(e.id); },
      getSourceHash: item => item.sourceHash,
      getExistingSourceHash: existing => findById<PromptEntity>(existing.id)?.sourceHash,
    });
  },
});

// ── Seeder: flows ────────────────────────────────────────────────────

function buildLabelMap<T extends { label: string; id: string }>(entities: T[]): Map<string, string> {
  return new Map(entities.map(e => [e.label, e.id]));
}

registerSeeder({
  key: 'flows',
  seed(ctx: SeederContext): SeedCounts {
    const counts: SeedCounts = { created: 0, updated: 0, skipped: 0 };
    const flowsDSL = loadJSON<FlowDSL>(path.join(ctx.compiledDir, 'compiled-flows.json'));
    if (!flowsDSL) {
      ctx.log('  compiled-flows.json not found, skipping flows');
      return counts;
    }

    if (ctx.mode === 'wipe-and-replace') {
      const allFlows = findAll<FlowEntity>(EARS.Entity.Flow);
      for (const flow of allFlows) {
        try { repo().flowsCommands.deleteFlow(flow.id); } catch {}
      }
      ctx.log('  flows wiped');
    }

    const existingFlows = findAll<FlowEntity>(EARS.Entity.Flow);
    const existingByLabel = new Map(existingFlows.map(f => [f.label, f]));
    const actionMap = buildLabelMap(findAll<ActionEntity>(EARS.Entity.Action));
    const promptMap = buildLabelMap(repo().promptQueries.all());

    const validFlowDSL: FlowDSL = {};
    const replacedLabels = new Set<string>();
    for (const [key, entry] of Object.entries(flowsDSL)) {
      if (!shouldSeedAll(ctx.include) && !(ctx.include as ReadonlySet<string>).has(key)) {
        continue;
      }

      const validation = validate({ [key]: entry }, {
        actions: Array.from(actionMap.keys()),
        prompts: Array.from(promptMap.keys()),
      });
      if (!validation.valid) {
        const msgs = validation.errors.map(e => `${e.path}: ${e.message}`);
        console.warn(`[seed] Skipping flow "${key}":`, msgs.join('; '));
        counts.skipped++;
        continue;
      }

      const existing = existingByLabel.get(key);
      const compiledHash = isFlowConfig(entry) ? entry.sourceHash : undefined;

      if (existing) {
        if (ctx.mode === 'keep-existing') {
          ctx.log(`  flow skipped (existing): ${key}`);
          counts.skipped++;
          continue;
        }

        if (!existing.sourceHash) {
          ctx.log(`  flow skipped (user-owned): ${key}`);
          counts.skipped++;
          continue;
        }

        if (compiledHash && existing.sourceHash === compiledHash) {
          ctx.log(`  flow unchanged (hash match): ${key}`);
          counts.skipped++;
          continue;
        }

        try {
          repo().flowsCommands.deleteFlow(existing.id, { allowRoot: true });
          replacedLabels.add(key);
          ctx.log(`  flow replaced${existing.sourceHash ? ' (hash mismatch)' : ' (no prior hash)'}: ${key}`);
        } catch (error) {
          console.warn(`[seed] Failed to replace seed flow "${existing.label}":`, (error as Error).message);
          ctx.log(`  flow skipped: ${key}`);
          counts.skipped++;
          continue;
        }
      }
      validFlowDSL[key] = entry;
    }

    const flowNames = Object.keys(validFlowDSL);
    if (flowNames.length === 0) {
      ctx.log('  no flows to import');
      return counts;
    }

    repo().flowsCommands.importFromDSL(compile(validFlowDSL, { actions: actionMap, prompts: promptMap }));
    for (const name of flowNames) {
      if (replacedLabels.has(name)) {
        counts.updated++;
        ctx.log(`  flow updated: ${name}`);
      } else {
        counts.created++;
        ctx.log(`  flow created: ${name}`);
      }
    }
    return counts;
  },
});

// ── Seeder: library ──────────────────────────────────────────────────

const RELATIVE_MEDIA_RE = /!\[([^\]]*)\]\((media\/([^)]+))\)/g;

function restoreDocMedia(
  content: ContentSection[],
  docId: string,
  mediaDir: string,
  log: (...a: any[]) => void,
): { content: ContentSection[]; mediaCount: number } {
  let mediaCount = 0;
  const updated = content.map(section => {
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

function shouldSkipByHash(
  existingHash: string | undefined,
  compiledHash: string | undefined,
): boolean {
  if (!existingHash) return true;
  return !!compiledHash && existingHash === compiledHash;
}

function seedLibraryTree(
  items: ExportedItem[],
  parentId: EARS.EntityId | undefined,
  counts: SeedCounts,
  log: (...a: any[]) => void,
  mediaDir: string,
  mode?: ImportMode,
): void {
  for (const item of items) {
    if (item.type === 'document') {
      const existing = findWhere<Document>(EARS.Entity.Document, 'name', item.name)[0];
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
        repo().libraryCommands.updateDocument(existing.id, item.name, content, item.tags ?? [], undefined, item.sourceHash);
        counts.updated++;
        log(`  library doc updated: ${item.name}`);
      } else {
        const doc = repo().libraryCommands.createDocument(item.name, item.content, item.tags ?? [], parentId, undefined, item.sourceHash);
        const { content, mediaCount } = restoreDocMedia(item.content, doc.id, mediaDir, log);
        if (mediaCount > 0) {
          repo().libraryCommands.updateDocument(doc.id as EARS.EntityId, item.name, content, item.tags ?? [], undefined, item.sourceHash);
        }
        counts.created++;
        log(`  library doc created: ${item.name}`);
      }
    } else if (item.type === 'collection') {
      const existing = findWhere<Collection>(EARS.Entity.Collection, 'name', item.name)[0];
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
        repo().libraryCommands.updateCollection(colId, item.name, item.description, item.sourceHash);
        counts.updated++;
        log(`  library collection updated: ${item.name}`);
      } else {
        const col = repo().libraryCommands.createCollection(item.name, item.description, parentId, undefined, item.sourceHash);
        colId = col.id;
        counts.created++;
        log(`  library collection created: ${item.name}`);
      }
      seedLibraryTree(item.children, colId, counts, log, mediaDir, mode);
    }
  }
}

registerSeeder({
  key: 'library',
  seed(ctx: SeederContext): SeedCounts {
    const counts: SeedCounts = { created: 0, updated: 0, skipped: 0 };
    const libraryFile = path.join(ctx.compiledDir, 'compiled-library.json');
    const libraryData = loadJSON<ExportedLibrary | ExportedItem[]>(libraryFile);
    if (!libraryData) {
      ctx.log('  compiled-library.json not found, skipping library');
      return counts;
    }
    const allItems = Array.isArray(libraryData) ? libraryData : libraryData.items;
    const items = shouldSeedAll(ctx.include)
      ? (allItems ?? [])
      : (allItems ?? []).filter(i => (ctx.include as ReadonlySet<string>).has(i.name));
    if (ctx.mode === 'wipe-and-replace') {
      const docs = findAll<Document>(EARS.Entity.Document);
      const cols = findAll<Collection>(EARS.Entity.Collection);
      for (const d of docs) repo().libraryCommands.deleteDocument(d.id);
      for (const c of cols) repo().libraryCommands.deleteCollection(c.id);
      ctx.log('  library wiped');
    }
    const mediaDir = path.join(ctx.compiledDir, 'media');
    seedLibraryTree(items, undefined, counts, ctx.log, mediaDir, ctx.mode);
    return counts;
  },
});

// ── Seeder: notes ────────────────────────────────────────────────────

registerSeeder({
  key: 'notes',
  seed(ctx: SeederContext): SeedCounts {
    const counts: SeedCounts = { created: 0, updated: 0, skipped: 0 };
    const notesData = loadJSON<ExportedNotes>(path.join(ctx.compiledDir, 'compiled-notes.json'));
    if (!notesData) {
      ctx.log('  compiled-notes.json not found, skipping notes');
      return counts;
    }
    const filteredNotes: ExportedNotes = shouldSeedAll(ctx.include)
      ? notesData
      : {
          ...notesData,
          notes: (notesData.notes ?? []).filter(n =>
            (ctx.include as ReadonlySet<string>).has(n.title),
          ),
        };
    if (ctx.mode === 'wipe-and-replace') {
      const allNotes = findAll<any>(EARS.Entity.Note);
      for (const n of allNotes) repo().noteCommands.delete(n.id);
      ctx.log('  notes wiped');
    }
    const importResult = importNotesFromData(filteredNotes);
    counts.created = importResult.created;
    counts.updated = importResult.updated;
    counts.skipped = importResult.skipped;
    if (importResult.errors.length > 0) {
      importResult.errors.forEach(e => console.warn(`[seed] notes: ${e}`));
    }
    return counts;
  },
});

// ── Seeder: settings ─────────────────────────────────────────────────

registerSeeder({
  key: 'settings',
  seed(ctx: SeederContext): SeedCounts {
    const counts: SeedCounts = { created: 0, updated: 0, skipped: 0 };
    const settingsFile = path.join(ctx.compiledDir, 'compiled-settings.json');
    if (!fs.existsSync(settingsFile)) {
      ctx.log('  compiled-settings.json not found, skipping settings');
      return counts;
    }
    if (ctx.mode === 'keep-existing') {
      ctx.log('  settings skipped (existing)');
      counts.skipped = 1;
    } else {
      repo().settingsCommands.resetSettings();
      ctx.log('  settings reset to defaults');
      counts.updated = 1;
    }
    return counts;
  },
});

// ── Boot seed ────────────────────────────────────────────────────────

const SEED_FILES = [
  'compiled-actions.json', 'compiled-prompts.json',
  'compiled-flows.json', 'compiled-library.json', 'compiled-notes.json',
];

function computeSeedHash(compiledDir: string): string {
  const hash = crypto.createHash('sha256');
  for (const file of SEED_FILES) {
    const filePath = path.join(compiledDir, file);
    if (fs.existsSync(filePath)) hash.update(fs.readFileSync(filePath));
  }
  return hash.digest('hex').slice(0, 16);
}

export function runBootSeed(options?: { verbose?: boolean }): Record<string, SeedCounts> | null {
  const log = options?.verbose ? console.log.bind(console) : () => {};
  const compiledDir = DEFAULT_COMPILED_DIR;
  const currentHash = computeSeedHash(compiledDir);
  const storedHash = repo().settingsQueries.getInternalSettings().seedHash;

  if (storedHash === currentHash) {
    log('  seed skipped: data unchanged');
    return null;
  }

  const hasOnboarded = repo().settingsQueries.getInternalSettings().hasOnboarded;
  const include: Record<string, SeedIncludeSet> = { settings: new Set() };
  if (hasOnboarded) include.notes = new Set();
  const result = seedData({ compiledDir, include, verbose: options?.verbose });
  repo().settingsCommands.updateSettings('internal', null, ['seedHash'], currentHash);
  return result;
}
