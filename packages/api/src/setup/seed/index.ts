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
import { findById, findWhere, findAll } from '@/core/shared/repository/query-helpers';
import { actionCommands } from '@/systems/actions/repository';
import { promptQueries, promptCommands } from '@/systems/prompts/repository';
import { validate, compile, isFlowConfig } from '@/systems/flows/dsl';
import { flowsCommands } from '@/systems/flows/repository';
import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { ActionEntity } from '@/systems/actions/types';
import type { PromptEntity } from '@/systems/prompts/types';
import type { FlowDSL } from '@/systems/flows/dsl';
import type { FlowEntity } from '@/systems/flows/config/types';
import { libraryCommands } from '@/systems/library/repository';
import type { ContentSection, Document, Collection } from '@/systems/library/types';
import type { ExportedLibrary, ExportedItem } from '@/systems/library/export-types';
import { getMediaPath } from '@/core/shared/paths';
import { importNotesFromData } from '@/systems/notes/import-notes';
import { noteCommands } from '@/systems/notes/repository';
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
  settings: SeedCounts;
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
  settings?: SeedIncludeSet;
}

export type ImportMode = 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace';

function shouldSeedAll(inc: SeedIncludeSet | undefined): boolean {
  return inc === undefined || inc === true;
}

function filterByInclude<T>(items: T[], getKey: (item: T) => string, inc: SeedIncludeSet | undefined): T[] {
  if (shouldSeedAll(inc)) return items;
  const set = inc as ReadonlySet<string>;
  return items.filter(item => set.has(getKey(item)));
}

export const DEFAULT_COMPILED_DIR = path.resolve(process.cwd(), '..', 'default-setup', 'dist');

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

export function loadJSON<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch (err) {
    console.warn(`[seed] Failed to parse ${path.basename(filePath)}:`, (err as Error).message);
    return null;
  }
}

/** Returns a skip reason if the item should not be updated, or null to proceed. */
function shouldSkipByHash(
  existingHash: string | undefined,
  compiledHash: string | undefined,
): 'untracked' | 'unchanged' | null {
  if (!existingHash) return 'untracked';
  if (compiledHash && existingHash === compiledHash) return 'unchanged';
  return null;
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
  mode?: ImportMode;
  wipe?: () => void;
  /** Extract sourceHash from compiled item. Enables hash-aware seed logic. */
  getSourceHash?: (item: T) => string | undefined;
  /** Extract sourceHash from existing DB entity. Required if getSourceHash is set. */
  getExistingSourceHash?: (existing: { id: EARS.EntityId }) => string | undefined;
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
  if (opts.mode === 'wipe-and-replace' && opts.wipe) {
    opts.wipe();
    opts.log(`  ${opts.label} wiped`);
  }
  const hashAware = opts.getSourceHash && opts.getExistingSourceHash;
  for (const item of data) {
    const key = opts.getKey(item);
    const existing = opts.findExisting(item);
    if (existing) {
      if (opts.mode === 'keep-existing') {
        opts.log(`  ${opts.label} skipped (existing): ${key}`);
        counts.skipped++;
      } else if (hashAware) {
        const skip = shouldSkipByHash(opts.getExistingSourceHash!(existing), opts.getSourceHash!(item));
        if (skip) {
          opts.log(`  ${opts.label} ${skip}: ${key}`);
          counts.skipped++;
        } else {
          opts.update(existing.id, item);
          opts.log(`  ${opts.label} updated: ${key}`);
          counts.updated++;
        }
      } else {
        opts.update(existing.id, item);
        opts.log(`  ${opts.label} updated: ${key}`);
        counts.updated++;
      }
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
  sourceHash?: string;
}

interface CompiledPrompt {
  label: string;
  description: string;
  category: string;
  inputs: any;
  templateFn: string;
  sourceHash?: string;
}

function buildLabelMap<T extends { label: string; id: string }>(entities: T[]): Map<string, string> {
  return new Map(entities.map(e => [e.label, e.id]));
}

function isSeedOwnedFlow(flow: FlowEntity): boolean {
  return !!flow.sourceHash;
}

function replaceSeedFlow(flow: FlowEntity): boolean {
  try {
    flowsCommands.deleteFlow(flow.id, { allowRoot: true });
    return true;
  } catch (error) {
    console.warn(`[seed] Failed to replace seed flow "${flow.label}":`, (error as Error).message);
    return false;
  }
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
        const skip = shouldSkipByHash(existing.sourceHash, item.sourceHash);
        if (skip) {
          counts.skipped++;
          log(`  library doc ${skip}: ${item.name}`);
          continue;
        }
        const { content } = restoreDocMedia(item.content, existing.id, mediaDir, log);
        libraryCommands.updateDocument(existing.id, item.name, content, item.tags ?? [], undefined, item.sourceHash);
        counts.updated++;
        log(`  library doc updated: ${item.name}`);
      } else {
        const doc = libraryCommands.createDocument(item.name, item.content, item.tags ?? [], parentId, undefined, item.sourceHash);
        const { content, mediaCount } = restoreDocMedia(item.content, doc.id, mediaDir, log);
        if (mediaCount > 0) {
          libraryCommands.updateDocument(doc.id as EARS.EntityId, item.name, content, item.tags ?? [], undefined, item.sourceHash);
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
        const skip = shouldSkipByHash(existing.sourceHash, item.sourceHash);
        if (skip) {
          counts.skipped++;
          log(`  library collection ${skip}: ${item.name}`);
          seedLibraryTree(item.children, existing.id, counts, log, mediaDir, mode);
          continue;
        }
        colId = existing.id;
        libraryCommands.updateCollection(colId, item.name, item.description, item.sourceHash);
        counts.updated++;
        log(`  library collection updated: ${item.name}`);
      } else {
        const col = libraryCommands.createCollection(item.name, item.description, parentId, undefined, item.sourceHash);
        colId = col.id;
        counts.created++;
        log(`  library collection created: ${item.name}`);
      }
      seedLibraryTree(item.children, colId, counts, log, mediaDir, mode);
    }
    // Skip symlinks in seed context
  }
}

function seedFlows(
  flowsDSL: FlowDSL,
  result: SeedResult,
  log: (...args: any[]) => void,
  include: SeedIncludeSet | undefined,
  mode?: ImportMode,
): void {
  // Wipe all flows (except root — deleteFlow throws for it) before re-importing
  if (mode === 'wipe-and-replace') {
    const allFlows = findAll<FlowEntity>(EARS.Entity.Flow);
    for (const flow of allFlows) {
      try { flowsCommands.deleteFlow(flow.id); } catch {} // root flow throws, skip
    }
    log('  flows wiped');
  }

  // Build label → existing flow map so we can rebuild (delete + reimport) any
  // DSL-owned flow whose source has changed. User-owned flows without
  // sourceHash are protected, including user-owned root flows.
  const existingFlows = findAll<FlowEntity>(EARS.Entity.Flow);
  const existingByLabel = new Map(existingFlows.map(f => [f.label, f]));
  const actionMap = buildLabelMap(findAll<ActionEntity>(EARS.Entity.Action));
  const promptMap = buildLabelMap(promptQueries.all());

  const validFlowDSL: FlowDSL = {};
  const replacedLabels = new Set<string>();
  for (const [key, entry] of Object.entries(flowsDSL)) {
    if (!shouldSeedAll(include) && !(include as ReadonlySet<string>).has(key)) {
      continue;
    }

    const validation = validate({ [key]: entry }, {
      actions: Array.from(actionMap.keys()),
      prompts: Array.from(promptMap.keys()),
    });
    if (!validation.valid) {
      const msgs = validation.errors.map(e => `${e.path}: ${e.message}`);
      console.warn(`[seed] Skipping flow "${key}":`, msgs.join('; '));
      result.flows.skipped++;
      continue;
    }

    const existing = existingByLabel.get(key);
    const compiledHash = isFlowConfig(entry) ? entry.sourceHash : undefined;

    if (existing) {
      // In keep-existing mode, skip all existing flows
      if (mode === 'keep-existing') {
        log(`  flow skipped (existing): ${key}`);
        result.flows.skipped++;
        continue;
      }

      // User-created flow with same label — never overwrite
      if (!isSeedOwnedFlow(existing)) {
        log(`  flow skipped (user-owned): ${key}`);
        result.flows.skipped++;
        continue;
      }

      if (compiledHash && existing.sourceHash === compiledHash) {
        log(`  flow unchanged (hash match): ${key}`);
        result.flows.skipped++;
        continue;
      }

      if (replaceSeedFlow(existing)) {
        replacedLabels.add(key);
        log(`  flow replaced${existing.sourceHash ? ' (hash mismatch)' : ' (no prior hash)'}: ${key}`);
      } else {
        log(`  flow skipped: ${key}`);
        result.flows.skipped++;
        continue;
      }
    }
    validFlowDSL[key] = entry;
  }

  const flowNames = Object.keys(validFlowDSL);
  if (flowNames.length === 0) {
    log('  no flows to import');
    return;
  }

  flowsCommands.importFromDSL(compile(validFlowDSL, { actions: actionMap, prompts: promptMap }));
  for (const name of flowNames) {
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
  mode?: ImportMode;
  verbose?: boolean;
}): SeedResult {
  const log = options.verbose ? console.log.bind(console) : () => {};
  const compiledDir = options.compiledDir;
  const include = options.include;
  const mode = options.mode;

  const result: SeedResult = {
    actions: { created: 0, updated: 0, skipped: 0 },
    prompts: { created: 0, updated: 0, skipped: 0 },
    flows: { created: 0, updated: 0, skipped: 0 },
    library: { created: 0, updated: 0, skipped: 0 },
    notes: { created: 0, updated: 0, skipped: 0 },
    settings: { created: 0, updated: 0, skipped: 0 },
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
      sourceHash: item.sourceHash,
    }),
    update: (id, item) => actionCommands.update(id, {
      description: item.description, category: item.category,
      input: item.input, actionFn: item.actionFn, output: item.output,
      sourceHash: item.sourceHash,
    }),
    log,
    include: include?.actions,
    mode,
    wipe: () => { for (const e of findAll<ActionEntity>(EARS.Entity.Action)) actionCommands.delete(e.id); },
    getSourceHash: item => item.sourceHash,
    getExistingSourceHash: existing => findById<ActionEntity>(existing.id)?.sourceHash,
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
      sourceHash: item.sourceHash,
    }),
    update: (id, item) => promptCommands.update(id, {
      label: item.label, description: item.description, category: item.category,
      inputs: item.inputs, templateFn: item.templateFn,
      sourceHash: item.sourceHash,
    }),
    log,
    include: include?.prompts,
    mode,
    wipe: () => { for (const e of promptQueries.all()) promptCommands.delete(e.id); },
    getSourceHash: item => item.sourceHash,
    getExistingSourceHash: existing => findById<PromptEntity>(existing.id)?.sourceHash,
  });

  // --- Flows ---
  const runFlows =
    shouldSeedAll(include?.flows) || (include?.flows as ReadonlySet<string>).size > 0;
  if (runFlows) {
    const flowsDSL = loadJSON<FlowDSL>(path.join(compiledDir, 'compiled-flows.json'));
    if (flowsDSL) {
      seedFlows(flowsDSL, result, log, include?.flows, mode);
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
      if (mode === 'wipe-and-replace') {
        const docs = findAll<Document>(EARS.Entity.Document);
        const cols = findAll<Collection>(EARS.Entity.Collection);
        for (const d of docs) libraryCommands.deleteDocument(d.id);
        for (const c of cols) libraryCommands.deleteCollection(c.id);
        log('  library wiped');
      }
      const mediaDir = path.join(compiledDir, 'media');
      seedLibraryTree(items, undefined, result.library, log, mediaDir, mode);
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
      if (mode === 'wipe-and-replace') {
        const allNotes = findAll<any>(EARS.Entity.Note);
        for (const n of allNotes) noteCommands.delete(n.id);
        log('  notes wiped');
      }
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

  // --- Settings ---
  const runSettings = shouldSeedAll(include?.settings);
  if (runSettings) {
    const settingsFile = path.join(compiledDir, 'compiled-settings.json');
    if (fs.existsSync(settingsFile)) {
      if (mode === 'keep-existing') {
        log('  settings skipped (existing)');
        result.settings.skipped = 1;
      } else {
        settingsCommands.resetSettings();
        log('  settings reset to defaults');
        result.settings.updated = 1;
      }
    } else {
      log('  compiled-settings.json not found, skipping settings');
    }
  } else {
    log('  settings section skipped by include filter');
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

  // ── Boot seed strategy ──────────────────────────────────────────────
  //
  // EXCLUDED (user-owned content, seeded once at first install):
  //   settings — handled by createDefaultSettings() via deep-merge
  //   notes    — user-owned; new notes on upgrade go through migrations
  //
  // INCLUDED (system-managed, DSL updates propagate on upgrade):
  //   actions  — sourceHash tracking; user-created actions are protected
  //   prompts  — sourceHash tracking; user-created prompts are protected
  //   flows    — sourceHash tracking; user-created flows are protected
  //   library  — sourceHash tracking; user-created docs are protected
  //
  // All included types use per-item sourceHash to distinguish DSL-sourced
  // from user-created items. Only DSL items with changed hashes are updated.
  // ────────────────────────────────────────────────────────────────────
  const hasOnboarded = settingsQueries.getInternalSettings().hasOnboarded;
  const include: SeedInclude = { settings: new Set() };
  if (hasOnboarded) include.notes = new Set();
  const result = seedData({ compiledDir, include, verbose: options?.verbose });
  settingsCommands.updateSettings('internal', null, ['seedHash'], currentHash);
  return result;
}
