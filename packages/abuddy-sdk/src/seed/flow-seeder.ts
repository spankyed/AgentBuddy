import { findAll, repository } from '../ears/index';
import { loadJSON, shouldSeedAll, type Seeder, type SeederContext, type SeedCounts } from '../utils/index';
import { seedPath } from '../build/manifest';

function buildLabelMap(entities: any[]): Map<string, string> {
  return new Map(entities.map((e: any) => [e.label, e.id]));
}

export interface FlowSeederDeps {
  ears: any;
  validate: (dsl: any, options: any) => { valid: boolean; errors: any[] };
  compile: (dsl: any, ctx: any) => any;
  isFlowConfig: (entry: any) => boolean;
}

export function createFlowSeeder(deps: FlowSeederDeps): Seeder {
  const { ears, validate, compile, isFlowConfig } = deps;
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
          console.warn(`[seed] Skipping flow "${key}":`, msgs.join('; '));
          counts.skipped++;
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

      repo.flowsCommands.importFromDSL(compile(validFlowDSL, { actions: actionMap, prompts: promptMap }));
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
