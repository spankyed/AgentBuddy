import * as crypto from 'node:crypto';
import { builtinRepository } from '../ears/builtin-repositories.ts';
import { getAttr, updateAttr } from '../ears/attribute-storage.ts';
import { findRelations } from '../ears/relations.ts';
import { findAll, findByIdRaw } from '../ears/query-helpers.ts';
import { loadJSON, shouldSeedAll, type Seeder, type SeederContext, type SeedCounts } from '../utils/index.ts';
import { seedPath } from '../build/manifest.ts';
import { compile as compileFlowDSL } from '../build/compilers/flow-compiler.ts';
import { validate } from '../build/compilers/flow-dsl-validator.ts';
import { isFlowConfig, type FlowDSL } from '../build/compilers/flow-types.ts';
import { EARS } from '../types/entities.ts';
import type { ActionEntity, FlowEntity } from '../types/sdk-entities.ts';
import type { CompiledRows } from '../build/compilers/flow-compiler.ts';
import { childSeedKey, SEED_KEY, seedingPackId, seedKeyPrefix } from './seeder.ts';

/** What the seeder wrote for a flow: its row's fields, each node's fields, the relation kinds between them, and a hash of their stored state */
interface SeededGraph {
  flowFields: string[];
  nodeFields: Record<string, string[]>;
  relKinds: string[];
  hash: string;
}

const SEEDED_GRAPH = 'seededGraph' as EARS.AttrKind;
// createdAt is when the rows were written, not what was written
const ROW_KEYS = new Set(['id', 'sourceHash', 'createdAt']);

/** The flow's rows as stored now, for the fields and relation kinds the seeder wrote; independent of relation order */
function hashGraph(flowId: EARS.EntityId, seeded: Omit<SeededGraph, 'hash'>): string {
  const values = (id: string, fields: readonly string[] | undefined) => fields?.map((field) => getAttr(id as EARS.EntityId, field as EARS.AttrKind) ?? null) ?? null;
  const nodeIds = findRelations({ sourceEntity: flowId, relationType: EARS.RelKind.CONTAINS }).map((r) => r.targetEntity as string).sort();
  const relations = [flowId, ...nodeIds]
    .flatMap((source) => findRelations({ sourceEntity: source as EARS.EntityId }))
    .filter((r) => seeded.relKinds.includes(r.relationType))
    .map((r) => JSON.stringify([r.sourceEntity, r.relationType, r.targetEntity, r.info ?? null]))
    .sort();
  const state = [values(flowId, seeded.flowFields), nodeIds.map((id) => [id, values(id, seeded.nodeFields[id])]), relations];
  return crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 16);
}

/** Records a newly imported flow's seeded graph, so a later seed can tell whether it was edited */
function stampSeededGraph(flowId: EARS.EntityId, compiled: CompiledRows): void {
  const rows = compiled.entity as Array<Record<string, unknown> & { id: string }>;
  const fieldsOf = (id: string) => Object.keys(rows.find((row) => row.id === id) ?? {}).filter((key) => !ROW_KEYS.has(key)).sort();
  const nodeIds = compiled.relation.filter((r) => r.source === flowId && r.kind === EARS.RelKind.CONTAINS).map((r) => r.target);
  const sources = new Set([flowId, ...nodeIds]);
  const seeded = {
    flowFields: fieldsOf(flowId),
    nodeFields: Object.fromEntries(nodeIds.map((id) => [id, fieldsOf(id)])),
    relKinds: [...new Set(compiled.relation.filter((r) => sources.has(r.source)).map((r) => r.kind))].sort(),
  };
  updateAttr(flowId, SEEDED_GRAPH, { ...seeded, hash: hashGraph(flowId, seeded) } satisfies SeededGraph);
}

/** The flow's nodes, fields and relations still hold what the seeder wrote */
function holdsSeededGraph(flowId: EARS.EntityId, seeded: SeededGraph): boolean {
  return hashGraph(flowId, seeded) === seeded.hash;
}

/** A DSL entry's seed key: the seeding pack, then the entry key and the flow's name in the source */
const flowSeedKey = (packId: string, name: string) => `${seedKeyPrefix(packId)}${childSeedKey('flows', { entity: EARS.Entity.Flow, label: name }, ['label'])}`;

function buildLabelMap(entities: Array<{ label: string; id: EARS.EntityId }>): Map<string, string> {
  return new Map(entities.map((e) => [e.label, e.id]));
}

export function createFlowSeeder(): Seeder {
  return {
    key: 'flows',
    seed(ctx: SeederContext): SeedCounts {
      const counts: SeedCounts = { created: 0, updated: 0, skipped: 0 };
      const flowsDSL: any = loadJSON(seedPath(ctx.compiledDir, 'flows'));
      if (!flowsDSL) {
        ctx.log('  flows artifact not found, skipping flows');
        return counts;
      }

      const packId = seedingPackId(ctx.compiledDir);

      if (ctx.mode === 'wipe-and-replace') {
        for (const flow of findAll<FlowEntity>(EARS.Entity.Flow)) {
          try { builtinRepository.flowsCommands.deleteFlow(flow.id); } catch {}
        }
        ctx.log('  flows wiped');
      }

      /**
       * The flow seeded from this DSL entry, however it's been renamed; otherwise a flow without a seed key
       * that has its label (a user's flow), so a seed never adds a copy beside it.
       */
      const lookupSeeded = (flows: FlowEntity[], name: string): FlowEntity | undefined => {
        const seedKey = flowSeedKey(packId, name);
        return flows.find((flow) => getAttr(flow.id, SEED_KEY) === seedKey)
          ?? flows.find((flow) => flow.label === name && getAttr(flow.id, SEED_KEY) === null);
      };
      const existingFlows = findAll<FlowEntity>(EARS.Entity.Flow);
      const actionMap = buildLabelMap(findAll<ActionEntity>(EARS.Entity.Action));
      const promptMap = buildLabelMap(builtinRepository.promptQueries.all());

      /**
       * Who owns the flow a DSL entry would overwrite: flow and node ids derive from the flow's name, so
       * another pack's flow with that name, or a user's flow with those ids, would be written over. The
       * flow this seed replaces isn't a collision.
       */
      const collidingOwner = (name: string, entry: FlowDSL[string], replacing: FlowEntity | undefined): string | undefined => {
        const ownIds = new Set<string>(replacing
          ? [replacing.id, ...findRelations({ sourceEntity: replacing.id, relationType: EARS.RelKind.CONTAINS }).map((r) => r.targetEntity)]
          : []);
        const ids = (compileFlowDSL({ [name]: entry }, { actions: actionMap, prompts: promptMap }).entity as Array<{ id: string }>).map((row) => row.id);
        const taken = ids.find((id) => !ownIds.has(id) && findByIdRaw(id as EARS.EntityId));
        if (!taken) return undefined;
        const flowId = findRelations({ targetEntity: taken as EARS.EntityId, relationType: EARS.RelKind.CONTAINS })[0]?.sourceEntity ?? taken;
        const seedKey = getAttr(flowId as EARS.EntityId, SEED_KEY) as string | null;
        return seedKey ? `seeded by ${seedKey.slice(0, seedKey.indexOf(':'))}` : 'created by the user';
      };

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

        const existing = lookupSeeded(existingFlows, key);
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

          // A flow whose seeded graph wasn't recorded can't be checked for edits, so it's left alone too
          const seeded = getAttr(existing.id, SEEDED_GRAPH) as SeededGraph | null;
          if (!seeded || !holdsSeededGraph(existing.id, seeded)) {
            ctx.log(`  flow skipped (edited): ${key}`);
            counts.skipped++;
            continue;
          }
        }

        const owner = collidingOwner(key, entry, existing);
        if (owner) {
          const message = `Flow "${key}": a flow with this name already exists (${owner})`;
          console.error(`[seed] ${message}`);
          (counts.errors ??= []).push(message);
          continue;
        }

        if (existing) {
          try {
            builtinRepository.flowsCommands.deleteFlow(existing.id, { allowRoot: true });
            replacedLabels.add(key);
            ctx.log(`  flow replaced (hash mismatch): ${key}`);
          } catch (error: any) {
            console.warn(`[seed] Failed to replace seed flow "${existing.label}":`, error?.message);
            ctx.log(`  flow skipped: ${key}`);
            counts.skipped++;
            continue;
          }
        }
        validFlowDSL[key] = entry;
      }

      /**
       * The flows a subflow step can name that this seed doesn't (re)import, such as an unchanged flow
       * or a dependency's. A flow this pack's seed defines is its seeded flow, found by seed key however
       * it's been renamed, never another flow with its label. When it has no seeded flow (the seed left
       * a user's or another pack's flow with that name alone), the name runs that flow; other names
       * resolve by label.
       */
      const subflowTargets = (): Map<string, string> => {
        const flows = findAll<FlowEntity>(EARS.Entity.Flow);
        const seededIds = new Set<string>();
        const targets = new Map<string, string>();
        for (const name of Object.keys(flowsDSL)) {
          const seedKey = flowSeedKey(packId, name);
          const seeded = flows.find((flow) => getAttr(flow.id, SEED_KEY) === seedKey);
          if (!seeded) continue;
          targets.set(name, seeded.id);
          seededIds.add(seeded.id);
        }
        for (const flow of flows) {
          if (!seededIds.has(flow.id) && !targets.has(flow.label)) targets.set(flow.label, flow.id);
        }
        return targets;
      };

      const flowNames = Object.keys(validFlowDSL);
      if (flowNames.length === 0) {
        ctx.log('  no flows to import');
        return counts;
      }

      const compiled = compileFlowDSL(validFlowDSL, { actions: actionMap, prompts: promptMap, flows: subflowTargets() });
      builtinRepository.flowsCommands.importFromDSL(compiled);
      for (const name of flowNames) {
        const row = (compiled.entity as Array<{ id: string; entityType?: string; label?: string }>)
          .find((entity) => entity.entityType === EARS.Entity.Flow && entity.label === name);
        if (row) {
          updateAttr(row.id as EARS.EntityId, SEED_KEY, flowSeedKey(packId, name));
          stampSeededGraph(row.id as EARS.EntityId, compiled);
        }
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
