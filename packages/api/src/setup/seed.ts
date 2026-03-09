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
import type { ContentSection, Document } from '@/systems/library/types';

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
  result.library = seedCollection<{ name: string; content: ContentSection[]; tags?: string[] }>({
    file: path.join(compiledDir, 'compiled-library.json'),
    label: 'library doc',
    getKey: item => item.name,
    findExisting: item => findWhere<Document>(EARS.Entity.Document, 'name', item.name)[0],
    create: item => libraryCommands.createDocument(item.name, item.content, item.tags ?? []),
    update: (id, item) => libraryCommands.updateDocument(id, item.name, item.content, item.tags ?? []),
    log,
  });

  // Mark as seeded
  settingsCommands.updateSettings('internal', null, ['seeded'], true);

  return result;
}
