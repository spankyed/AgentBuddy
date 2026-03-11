/**
 * Database Seed — loads compiled scratchpad artifacts into LMDB
 *
 * Run-once: skips seeding if the `seeded` internal flag is already set,
 * unless `force` is passed. The CLI script always forces.
 */

import * as fs from 'fs';
import * as path from 'path';
import { EARS } from '@/core/types';
import { findWhere, findAll } from '@/core/helpers/repository/query-helpers';
import { actionCommands } from '@/systems/actions/repository';
import { promptQueries, promptCommands } from '@/systems/prompts/repository';
import { validate, compile } from '@/systems/flows/dsl';
import { flowsCommands } from '@/systems/flows/repository';
import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { ActionEntity } from '@/systems/actions/types';
import type { FlowDSL } from '@/systems/flows/dsl';
import type { FlowEntity } from '@/systems/flows/config/types';
import { libraryCommands } from '@/systems/library/repository';
import type { ContentSection, Document, Collection } from '@/systems/library/types';
import type { ExportedLibrary, ExportedItem } from '@/systems/library/export-types';
import { getMediaPath } from '@/core/helpers/paths';

interface SeedCounts {
  created: number;
  updated: number;
  skipped: number;
}

export interface SeedResult {
  actions: SeedCounts;
  prompts: SeedCounts;
  flows: SeedCounts;
  library: SeedCounts;
}

const DEFAULT_COMPILED_DIR = path.resolve(process.cwd(), 'dist/compiled');

function loadJSON<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function seedCollection<T>(opts: {
  file: string;
  label: string;
  getKey: (item: T) => string;
  findExisting: (item: T) => { id: EARS.EntityId } | undefined;
  create: (item: T) => void;
  update: (id: EARS.EntityId, item: T) => void;
  log: (...args: any[]) => void;
}): SeedCounts {
  const counts: SeedCounts = { created: 0, updated: 0, skipped: 0 };
  const data = loadJSON<T[]>(opts.file);
  if (!data) {
    opts.log(`  ${opts.label} file not found, skipping`);
    return counts;
  }
  for (const item of data) {
    const key = opts.getKey(item);
    const existing = opts.findExisting(item);
    if (existing) {
      opts.update(existing.id, item);
      opts.log(`  ${opts.label} updated: ${key}`);
      counts.updated++;
    } else {
      opts.create(item);
      opts.log(`  ${opts.label} created: ${key}`);
      counts.created++;
    }
  }
  return counts;
}

function buildLabelMap<T extends { label: string; id: string }>(entities: T[]): Map<string, string> {
  return new Map(entities.map(e => [e.label, e.id]));
}

/** Match relative media references like ![alt](media/filename.ext) */
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
      let match: RegExpExecArray | null;
      const re = new RegExp(RELATIVE_MEDIA_RE.source, RELATIVE_MEDIA_RE.flags);
      while ((match = re.exec(section.text)) !== null) {
        const filename = match[3];
        const srcFile = path.join(mediaDir, filename);
        if (!fs.existsSync(srcFile)) continue;

        const destDir = path.join(getMediaPath(), docId);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
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

function seedLibraryTree(
  items: ExportedItem[],
  parentId: EARS.EntityId | undefined,
  counts: SeedCounts,
  log: (...a: any[]) => void,
  mediaDir: string,
): void {
  for (const item of items) {
    if (item.type === 'document') {
      const existing = findWhere<Document>(EARS.Entity.Document, 'name', item.name)[0];
      if (existing) {
        const { content } = restoreDocMedia(item.content, existing.id, mediaDir, log);
        libraryCommands.updateDocument(existing.id, item.name, content, item.tags ?? []);
        counts.updated++;
        log(`  library doc updated: ${item.name}`);
      } else {
        const doc = libraryCommands.createDocument(item.name, item.content, item.tags ?? [], parentId);
        const { content, mediaCount } = restoreDocMedia(item.content, doc.id, mediaDir, log);
        if (mediaCount > 0) {
          libraryCommands.updateDocument(doc.id as EARS.EntityId, item.name, content, item.tags ?? []);
        }
        counts.created++;
        log(`  library doc created: ${item.name}`);
      }
    } else if (item.type === 'collection') {
      const existing = findWhere<Collection>(EARS.Entity.Collection, 'name', item.name)[0];
      let colId: EARS.EntityId;
      if (existing) {
        colId = existing.id;
        libraryCommands.updateCollection(colId, item.name, item.description);
        counts.updated++;
        log(`  library collection updated: ${item.name}`);
      } else {
        const col = libraryCommands.createCollection(item.name, item.description, parentId);
        colId = col.id;
        counts.created++;
        log(`  library collection created: ${item.name}`);
      }
      seedLibraryTree(item.children, colId, counts, log, mediaDir);
    }
    // Skip symlinks in seed context
  }
}

export function seedData(options?: { verbose?: boolean; force?: boolean; compiledDir?: string }): SeedResult | null {
  const log = options?.verbose ? console.log.bind(console) : () => {};

  // Run-once gate
  if (!options?.force) {
    const internal = settingsQueries.getInternalSettings();
    if (internal.seeded) {
      log('  seed skipped: already seeded');
      return null;
    }
  }

  const compiledDir = options?.compiledDir ?? DEFAULT_COMPILED_DIR;

  const result: SeedResult = {
    actions: { created: 0, updated: 0, skipped: 0 },
    prompts: { created: 0, updated: 0, skipped: 0 },
    flows: { created: 0, updated: 0, skipped: 0 },
    library: { created: 0, updated: 0, skipped: 0 },
  };

  // --- Actions ---
  result.actions = seedCollection<Record<string, any>>({
    file: path.join(compiledDir, 'compiled-actions.json'),
    label: 'action',
    getKey: item => item.label,
    findExisting: item => findWhere<ActionEntity>(EARS.Entity.Action, 'label', item.label)[0],
    create: item => actionCommands.create({
      label: item.label, description: item.description, category: item.category,
      input: item.input, actionFn: item.actionFn, output: item.output,
    }),
    update: (id, item) => actionCommands.update(id, {
      description: item.description, category: item.category,
      input: item.input, actionFn: item.actionFn, output: item.output,
    }),
    log,
  });

  // --- Prompts ---
  result.prompts = seedCollection<Record<string, any>>({
    file: path.join(compiledDir, 'compiled-prompts.json'),
    label: 'prompt',
    getKey: item => item.label,
    findExisting: item => promptQueries.byLabel(item.label) ?? undefined,
    create: item => promptCommands.create({
      label: item.label, description: item.description, category: item.category,
      inputs: item.inputs, templateFn: item.templateFn,
    }),
    update: (id, item) => promptCommands.update(id, {
      label: item.label, description: item.description, category: item.category,
      inputs: item.inputs, templateFn: item.templateFn,
    }),
    log,
  });

  // --- Flows ---
  const flowsFile = path.join(compiledDir, 'compiled-flows.json');
  const flowsDSL = loadJSON<FlowDSL>(flowsFile);

  if (flowsDSL) {
    const existingFlows = findAll<FlowEntity>(EARS.Entity.Flow);
    const existingLabels = new Set(existingFlows.map(f => f.label));

    const filteredDSL: FlowDSL = Object.fromEntries(
      Object.entries(flowsDSL).filter(([key]) => {
        if (existingLabels.has(key)) {
          log(`  flow skipped: ${key}`);
          result.flows.skipped++;
          return false;
        }
        return true;
      })
    );

    if (Object.keys(filteredDSL).length === 0) {
      log('  no new flows to import');
    } else {
      const actionMap = buildLabelMap(findAll<ActionEntity>(EARS.Entity.Action));
      const promptMap = buildLabelMap(promptQueries.all());

      const validation = validate(filteredDSL, {
        actions: Array.from(actionMap.keys()),
        prompts: Array.from(promptMap.keys()),
      });

      if (!validation.valid) {
        log('  flow validation errors:');
        for (const err of validation.errors) {
          log(`    ${err.path}: ${err.message}`);
        }
        result.flows.skipped += Object.keys(filteredDSL).length;
      } else {
        const compiled = compile(filteredDSL, {
          actions: actionMap,
          prompts: promptMap,
        });

        const { flowIds } = flowsCommands.importFromDSL(compiled);
        result.flows.created = flowIds.length;
        log(`  flows created: ${flowIds.length}`);
      }
    }
  } else {
    log('  compiled-flows.json not found, skipping flows');
  }

  // --- Library Docs ---
  const libraryFile = path.join(compiledDir, 'compiled-library.json');
  const libraryData = loadJSON<ExportedLibrary | ExportedItem[]>(libraryFile);
  if (libraryData) {
    const items = Array.isArray(libraryData) ? libraryData : libraryData.items;
    const mediaDir = path.join(compiledDir, 'media');
    seedLibraryTree(items ?? [], undefined, result.library, log, mediaDir);
  } else {
    log('  compiled-library.json not found, skipping library');
  }

  // Mark as seeded
  settingsCommands.updateSettings('internal', null, ['seeded'], true);

  return result;
}
