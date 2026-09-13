import { repository } from '../ears/index.ts';
import { findAll } from '../ears/query-helpers.ts';
import { loadJSON, shouldSeedAll, type Seeder, type SeederContext, type SeedCounts } from '../utils/index.ts';
import { seedPath } from '../build/manifest.ts';
import { compile as compileFlowDSL } from '../build/compilers/flow-compiler.ts';
import { validate } from '../build/compilers/flow-dsl-validator.ts';
import { isFlowConfig } from '../build/compilers/flow-types.ts';
import type { FlowEARS } from '../build/compilers/flow-compiler.ts';

function buildLabelMap(entities: any[]): Map<string, string> {
  return new Map(entities.map((e: any) => [e.label, e.id]));
}

export function createFlowSeeder(ears: FlowEARS): Seeder {
  const repo = repository as any;

  return {
    key: 'flows',
    seed(ctx: SeederContext): SeedCounts {
      const counts: SeedCounts = { created: 0, updated: 0, skipped: 0 };
      const flowsDSL: any = loadJSON(seedPath(ctx.compiledDir, 'flows'));
      if (!flowsDSL) {
        ctx.log('  flows artifact not found, skipping flows');
        return counts;
      }

      if (ctx.mode === 'wipe-and-replace') {
        for (const flow of findAll(ears.Entity.Flow)) {
          try { repo.flowsCommands.deleteFlow((flow as any).id); } catch {}
        }
        ctx.log('  flows wiped');
      }

      const existingFlows = findAll(ears.Entity.Flow) as any[];
      const existingByLabel = new Map(existingFlows.map((f: any) => [f.label, f]));
      const actionMap = buildLabelMap(findAll(ears.Entity.Action) as any[]);
      const promptMap = buildLabelMap(repo.promptQueries.all());

      const validFlowDSL: Record<string, any> = {};
      const replacedLabels = new Set<string>();

      for (const [key, entry] of Object.entries(flowsDSL as Record<string, any>)) {
        if (!shouldSeedAll(ctx.include) && !(ctx.include as ReadonlySet<string>).has(key)) {
          continue;
        }

        const validation = validate({ [key]: entry }, {
          actions: Array.from(actionMap.keys()),
          prompts: Array.from(promptMap.keys()),
        });
        if (!validation.valid) {
          const msgs = validation.errors.map((e: any) => `${e.path}: ${e.message}`);
          const message = `Flow "${key}" is invalid: ${msgs.join('; ')}`;
          console.error(`[seed] ${message}`);
          (counts.errors ??= []).push(message);
          continue;
        }

        const existing = existingByLabel.get(key) as any;
        const compiledHash = isFlowConfig(entry) ? (entry as any).sourceHash : undefined;

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
            repo.flowsCommands.deleteFlow(existing.id, { allowRoot: true });
            replacedLabels.add(key);
            ctx.log(`  flow replaced${existing.sourceHash ? ' (hash mismatch)' : ' (no prior hash)'}: ${key}`);
          } catch (error: any) {
            console.warn(`[seed] Failed to replace seed flow "${existing.label}":`, error?.message);
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

      repo.flowsCommands.importFromDSL(
        compileFlowDSL(validFlowDSL, ears, { actions: actionMap, prompts: promptMap })
      );
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
  };
}
