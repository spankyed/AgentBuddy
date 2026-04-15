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
import { validate, compile, isFlowConfig } from '@/systems/flows/dsl';
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

/**
 * Per-type item filter. `true` / `undefined` = import everything.
 * A `Set<string>` restricts the section to only those top-level keys.
 * An empty set skips the section entirely.
 */
export type SeedIncludeSet = true | ReadonlySet<string>;
export interface SeedInclude {
  actions?: SeedIncludeSet;
  prompts?: SeedIncludeSet;
  flows?: SeedIncludeSet;
  library?: SeedIncludeSet;
  notes?: SeedIncludeSet;
}

function shouldSeedAll(inc: SeedIncludeSet | undefined): boolean {
  return inc === undefined || inc === true;
}

function filterByInclude<T>(items: T[], getKey: (item: T) => string, inc: SeedIncludeSet | undefined): T[] {
  if (shouldSeedAll(inc)) return items;
  const set = inc as ReadonlySet<string>;
  return items.filter(item => set.has(getKey(item)));
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
  include?: SeedIncludeSet;
}): SeedCounts {
  const counts: SeedCounts = { created: 0, updated: 0, skipped: 0 };
  const raw = loadJSON<T[]>(opts.file);
  if (!raw) {
    opts.log(`  ${opts.label} file not found, skipping`);
    return counts;
  }
  const data = filterByInclude(raw, opts.getKey, opts.include);
  if (data.length === 0 && !shouldSeedAll(opts.include)) {
    opts.log(`  ${opts.label} section skipped by include filter`);
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
  include: SeedIncludeSet | undefined,
): void {
  // Build label → existing flow map so we can rebuild (delete + reimport) any
  // flow whose source has changed. Previously this function skipped existing
  // flows entirely, which meant DSL edits never propagated without db:reset.
  // The root flow is still skipped because `deleteFlow` refuses to drop it;
  // root flow edits continue to need a manual reset.
  const existingFlows = findAll<FlowEntity>(EARS.Entity.Flow);
  const existingByLabel = new Map(existingFlows.map(f => [f.label, f]));

  const filteredDSL: FlowDSL = {};
  const replacedLabels = new Set<string>();
  for (const [key, entry] of Object.entries(flowsDSL)) {
    if (!shouldSeedAll(include) && !(include as ReadonlySet<string>).has(key)) {
      continue;
    }
    const existing = existingByLabel.get(key);
    const compiledHash = isFlowConfig(entry) ? entry.sourceHash : undefined;

    if (existing) {
      // User-created flow with same label — never overwrite
      if (!existing.sourceHash) {
        log(`  flow skipped (user-owned): ${key}`);
        result.flows.skipped++;
        continue;
      }

      if (compiledHash && existing.sourceHash === compiledHash) {
        log(`  flow unchanged (hash match): ${key}`);
        result.flows.skipped++;
        continue;
      }

      try {
        flowsCommands.deleteFlow(existing.id);
        replacedLabels.add(key);
        log(`  flow replaced${existing.sourceHash ? ' (hash mismatch)' : ' (no prior hash)'}: ${key}`);
      } catch (err) {
        // deleteFlow throws for the root flow — leave it alone and keep the
        // old skip behaviour so boot doesn't fail on root-flow DSL edits.
        console.warn(`[seed] Keeping existing flow "${key}" (cannot replace):`, (err as Error).message);
        log(`  flow skipped: ${key}`);
        result.flows.skipped++;
        continue;
      }
    }
    filteredDSL[key] = entry;
  }

  const flowNames = Object.keys(filteredDSL);
  if (flowNames.length === 0) {
    log('  no flows to import');
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
  for (const name of validNames) {
    if (replacedLabels.has(name)) {
      result.flows.updated++;
      log(`  flow updated: ${name}`);
    } else {
      result.flows.created++;
      log(`  flow created: ${name}`);
    }
  }
}

/**
 * Pure importer: reads compiled artifacts from `compiledDir`, applies the
 * optional `include` filter, and writes to LMDB via the per-system
 * repositories. Always runs; never touches `settings.internal.seedHash`
 * (that's `runBootSeed`'s job exclusively).
 */
export function seedData(options: {
  compiledDir: string;
  include?: SeedInclude;
  verbose?: boolean;
}): SeedResult {
  const log = options.verbose ? console.log.bind(console) : () => {};
  const compiledDir = options.compiledDir;
  const include = options.include;

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
    include: include?.actions,
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
    include: include?.prompts,
  });

  // --- Flows ---
  const runFlows =
    shouldSeedAll(include?.flows) || (include?.flows as ReadonlySet<string>).size > 0;
  if (runFlows) {
    const flowsDSL = loadJSON<FlowDSL>(path.join(compiledDir, 'compiled-flows.json'));
    if (flowsDSL) {
      seedFlows(flowsDSL, result, log, include?.flows);
    } else {
      log('  compiled-flows.json not found, skipping flows');
    }
  } else {
    log('  flows section skipped by include filter');
  }

  // --- Library Docs ---
  const runLibrary =
    shouldSeedAll(include?.library) || (include?.library as ReadonlySet<string>).size > 0;
  if (runLibrary) {
    const libraryFile = path.join(compiledDir, 'compiled-library.json');
    const libraryData = loadJSON<ExportedLibrary | ExportedItem[]>(libraryFile);
    if (libraryData) {
      const allItems = Array.isArray(libraryData) ? libraryData : libraryData.items;
      const items = shouldSeedAll(include?.library)
        ? (allItems ?? [])
        : (allItems ?? []).filter(i => (include!.library as ReadonlySet<string>).has(i.name));
      const mediaDir = path.join(compiledDir, 'media');
      seedLibraryTree(items, undefined, result.library, log, mediaDir);
    } else {
      log('  compiled-library.json not found, skipping library');
    }
  } else {
    log('  library section skipped by include filter');
  }

  // --- Notes ---
  const runNotes =
    shouldSeedAll(include?.notes) || (include?.notes as ReadonlySet<string>).size > 0;
  if (runNotes) {
    const notesData = loadJSON<ExportedNotes>(path.join(compiledDir, 'compiled-notes.json'));
    if (notesData) {
      const filteredNotes: ExportedNotes = shouldSeedAll(include?.notes)
        ? notesData
        : {
            ...notesData,
            notes: (notesData.notes ?? []).filter(n =>
              (include!.notes as ReadonlySet<string>).has(n.title),
            ),
          };
      const importResult = importNotesFromData(filteredNotes);
      result.notes.created = importResult.created;
      result.notes.updated = importResult.updated;
      result.notes.skipped = importResult.skipped;
      if (importResult.errors.length > 0) {
        importResult.errors.forEach(e => console.warn(`[seed] notes: ${e}`));
      }
    } else {
      log('  compiled-notes.json not found, skipping notes');
    }
  } else {
    log('  notes section skipped by include filter');
  }

  return result;
}

/**
 * Boot-time auto-seed. The **sole** writer of `settings.internal.seedHash`.
 *
 * Compares the hash of the default compiled directory against the last value
 * we stored. If they match, nothing to do — returns `null`. Otherwise runs a
 * full import and advances the stored hash so the next boot can short-circuit.
 *
 * Must not be called from the interactive import handler or the CLI — both
 * route through `seedData` directly so that this remains the only function in
 * the codebase that touches the hash.
 */
export function runBootSeed(options?: { verbose?: boolean }): SeedResult | null {
  const log = options?.verbose ? console.log.bind(console) : () => {};
  const compiledDir = DEFAULT_COMPILED_DIR;
  const currentHash = computeSeedHash(compiledDir);
  const storedHash = settingsQueries.getInternalSettings().seedHash;

  if (storedHash === currentHash) {
    log('  seed skipped: data unchanged');
    return null;
  }

  const result = seedData({ compiledDir, verbose: options?.verbose });
  settingsCommands.updateSettings('internal', null, ['seedHash'], currentHash);
  return result;
}
