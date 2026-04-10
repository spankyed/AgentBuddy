/**
 * Database Seed — loads compiled default-setup artifacts into LMDB
 *
 * Skips seeding if the compiled data hash is unchanged since last seed,
 * unless `force` is passed. The CLI script always forces.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
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
import { importNotesFromData } from '@/systems/notes/import-notes';
import type { ExportedNotes } from '@/systems/notes/export-types';

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
  notes: SeedCounts;
}

const DEFAULT_COMPILED_DIR = path.resolve(process.cwd(), '..', 'default-setup', 'dist');

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

function loadJSON<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch (err) {
    console.warn(`[seed] Failed to parse ${path.basename(filePath)}:`, (err as Error).message);
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

interface CompiledAction {
  label: string;
  description: string;
  category: string;
  input: any;
  actionFn: string;
  output: any;
}

interface CompiledPrompt {
  label: string;
  description: string;
  category: string;
  inputs: any;
  templateFn: string;
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
      for (const match of section.text.matchAll(RELATIVE_MEDIA_RE)) {
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

function seedFlows(
  flowsDSL: FlowDSL,
  result: SeedResult,
  log: (...args: any[]) => void,
): void {
  const existingLabels = new Set(findAll<FlowEntity>(EARS.Entity.Flow).map(f => f.label));

  const filteredDSL: FlowDSL = {};
  for (const [key, entry] of Object.entries(flowsDSL)) {
    if (existingLabels.has(key)) {
      log(`  flow skipped: ${key}`);
      result.flows.skipped++;
    } else {
      filteredDSL[key] = entry;
    }
  }

  const flowNames = Object.keys(filteredDSL);
  if (flowNames.length === 0) {
    log('  no new flows to import');
    return;
  }

  const actionMap = buildLabelMap(findAll<ActionEntity>(EARS.Entity.Action));
  const promptMap = buildLabelMap(promptQueries.all());

  const validFlowDSL: FlowDSL = {};
  for (const [flowName, entry] of Object.entries(filteredDSL)) {
    const validation = validate({ [flowName]: entry }, {
      actions: Array.from(actionMap.keys()),
      prompts: Array.from(promptMap.keys()),
    });
    if (!validation.valid) {
      const msgs = validation.errors.map(e => `${e.path}: ${e.message}`);
      console.warn(`[seed] Skipping flow "${flowName}":`, msgs.join('; '));
      result.flows.skipped++;
      continue;
    }
    validFlowDSL[flowName] = entry;
  }

  const validNames = Object.keys(validFlowDSL);
  if (validNames.length === 0) return;

  flowsCommands.importFromDSL(compile(validFlowDSL, { actions: actionMap, prompts: promptMap }));
  result.flows.created += validNames.length;
  validNames.forEach(name => log(`  flow created: ${name}`));
}

export function seedData(options?: { verbose?: boolean; force?: boolean; compiledDir?: string }): SeedResult | null {
  const log = options?.verbose ? console.log.bind(console) : () => {};

  const compiledDir = options?.compiledDir ?? DEFAULT_COMPILED_DIR;

  // Skip if data unchanged (hash match)
  if (!options?.force) {
    const internal = settingsQueries.getInternalSettings();
    const currentHash = computeSeedHash(compiledDir);
    if (internal.seedHash === currentHash) {
      log('  seed skipped: data unchanged');
      return null;
    }
  }

  const result: SeedResult = {
    actions: { created: 0, updated: 0, skipped: 0 },
    prompts: { created: 0, updated: 0, skipped: 0 },
    flows: { created: 0, updated: 0, skipped: 0 },
    library: { created: 0, updated: 0, skipped: 0 },
    notes: { created: 0, updated: 0, skipped: 0 },
  };

  // --- Actions ---
  result.actions = seedCollection<CompiledAction>({
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
  result.prompts = seedCollection<CompiledPrompt>({
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
  const flowsDSL = loadJSON<FlowDSL>(path.join(compiledDir, 'compiled-flows.json'));
  if (flowsDSL) {
    seedFlows(flowsDSL, result, log);
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

  // --- Notes ---
  const notesData = loadJSON<ExportedNotes>(path.join(compiledDir, 'compiled-notes.json'));
  if (notesData) {
    const importResult = importNotesFromData(notesData);
    result.notes.created = importResult.created;
    result.notes.updated = importResult.updated;
    result.notes.skipped = importResult.skipped;
    if (importResult.errors.length > 0) {
      importResult.errors.forEach(e => console.warn(`[seed] notes: ${e}`));
    }
  } else {
    log('  compiled-notes.json not found, skipping notes');
  }

  // Store content hash
  settingsCommands.updateSettings('internal', null, ['seedHash'], computeSeedHash(compiledDir));

  return result;
}
