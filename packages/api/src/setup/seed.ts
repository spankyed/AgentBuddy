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
  const actionsFile = path.join(compiledDir, 'compiled-actions.json');
  const actionsData = loadJSON<Array<Record<string, any>>>(actionsFile);

  if (actionsData) {
    for (const item of actionsData) {
      const existing = findWhere<ActionEntity>(EARS.Entity.Action, 'label', item.label);
      if (existing.length > 0) {
        actionCommands.update(existing[0].id, {
          description: item.description,
          category: item.category,
          input: item.input,
          actionFn: item.actionFn,
          output: item.output,
        });
        log(`  action updated: ${item.label}`);
        result.actions.updated++;
        continue;
      }
      actionCommands.create({
        label: item.label,
        description: item.description,
        category: item.category,
        input: item.input,
        actionFn: item.actionFn,
        output: item.output,
      });
      log(`  action created: ${item.label}`);
      result.actions.created++;
    }
  } else {
    log('  compiled-actions.json not found, skipping actions');
  }

  // --- Prompts ---
  const promptsFile = path.join(compiledDir, 'compiled-prompts.json');
  const promptsData = loadJSON<Array<Record<string, any>>>(promptsFile);

  if (promptsData) {
    for (const item of promptsData) {
      const existing = promptQueries.byLabel(item.label);
      if (existing) {
        promptCommands.update(existing.id, {
          label: item.label,
          description: item.description,
          category: item.category,
          inputs: item.inputs,
          templateFn: item.templateFn,
        });
        log(`  prompt updated: ${item.label}`);
        result.prompts.updated++;
        continue;
      }
      promptCommands.create({
        label: item.label,
        description: item.description,
        category: item.category,
        inputs: item.inputs,
        templateFn: item.templateFn,
      });
      log(`  prompt created: ${item.label}`);
      result.prompts.created++;
    }
  } else {
    log('  compiled-prompts.json not found, skipping prompts');
  }

  // --- Flows ---
  const flowsFile = path.join(compiledDir, 'compiled-flows.json');
  const flowsDSL = loadJSON<FlowDSL>(flowsFile);

  if (flowsDSL) {
    const existingFlows = findAll<FlowEntity>(EARS.Entity.Flow);
    const existingLabels = new Set(existingFlows.map(f => f.label));

    const filteredDSL: FlowDSL = {};
    for (const key of Object.keys(flowsDSL)) {
      if (existingLabels.has(key)) {
        log(`  flow skipped: ${key}`);
        result.flows.skipped++;
      } else {
        filteredDSL[key] = flowsDSL[key];
      }
    }

    if (Object.keys(filteredDSL).length === 0) {
      log('  no new flows to import');
    } else {
      const actionMap = new Map<string, string>();
      const allActions = findAll<ActionEntity>(EARS.Entity.Action);
      for (const a of allActions) {
        actionMap.set(a.label, a.id);
      }

      const promptMap = new Map<string, string>();
      const allPrompts = promptQueries.all();
      for (const p of allPrompts) {
        promptMap.set(p.label, p.id);
      }

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
  const libraryData = loadJSON<Array<{ name: string; content: ContentSection[]; tags?: string[] }>>(libraryFile);

  if (libraryData) {
    for (const item of libraryData) {
      const existing = findWhere<Document>(EARS.Entity.Document, 'name', item.name);
      if (existing.length > 0) {
        libraryCommands.updateDocument(existing[0].id, item.name, item.content, item.tags ?? []);
        log(`  library doc updated: ${item.name}`);
        result.library.updated++;
        continue;
      }
      libraryCommands.createDocument(item.name, item.content, item.tags ?? []);
      log(`  library doc created: ${item.name}`);
      result.library.created++;
    }
  } else {
    log('  compiled-library.json not found, skipping library docs');
  }

  // Mark as seeded
  settingsCommands.updateSettings('internal', null, ['seeded'], true);

  return result;
}
