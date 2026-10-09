import { flowRepository } from '../repositories/flow-repository.ts';
import { promptRepository } from '../repositories/prompt-repository.ts';
import { findRelations, installedEngine as ears, untypedTx } from '@abuddy/ears';
import { loadJSON, shouldImportAll, type Seeder, type ImportContext, type ImportCounts, type AppliedItem } from '../utils/index.ts';
import { seedPath } from '../build/manifest.ts';
import { compile as compileFlowDSL } from '../build/compilers/flow-compiler.ts';
import { validate } from '../build/compilers/flow-dsl-validator.ts';
import { isFlowConfig, type FlowDSL } from '../build/compilers/flow-types.ts';
import { EARS } from '../types/entities.ts';
import type { ActionEntity, FlowEntity } from '../types/sdk-entities.ts';
import type { CompiledRows } from '../build/compilers/flow-compiler.ts';
import { childSeedKey, defineSeedKey, hashValues, recordApplied, removedByUser, SEED_KEY, seedKeyPrefix } from './seeder.ts';
import { seedPackId } from '../utils/seed.ts';

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

/** A flow's three parts as stored now: its own values, each node's, and its edges */
type GraphState = [unknown[] | null, Array<[string, unknown[] | null]>, string[]];

/** The flow's rows as stored now, for the fields and relation kinds the seeder wrote; independent of relation order */
function graphState(flowId: EARS.EntityId, seeded: Omit<SeededGraph, 'hash'>): GraphState {
  const values = (id: string, fields: readonly string[] | undefined) => fields?.map((field) => ears().getAttr(id as EARS.EntityId, field as EARS.AttrKind) ?? null) ?? null;
  const nodeIds = findRelations({ sourceEntity: flowId, relationType: EARS.RelKind.CONTAINS }).map((r) => r.targetEntity as string).sort();
  const relations = [flowId, ...nodeIds]
    .flatMap((source) => findRelations({ sourceEntity: source as EARS.EntityId }))
    .filter((r) => seeded.relKinds.includes(r.relationType))
    .map((r) => JSON.stringify([r.sourceEntity, r.relationType, r.targetEntity, r.info ?? null]))
    .sort();
  return [values(flowId, seeded.flowFields), nodeIds.map((id) => [id, values(id, seeded.nodeFields[id])]), relations];
}

/** The one digest `seededGraph` holds: the three parts together */
const hashGraph = (flowId: EARS.EntityId, seeded: Omit<SeededGraph, 'hash'>): string => hashValues(graphState(flowId, seeded));

/**
 * The same walk's three parts, a hash each (`AppliedItem.parts`, `@abuddy/sdk/utils`): the flow's own fields,
 * each node's values as one unit, and the whole edge set with each edge's `info`.
 *
 * **It takes the state rather than re-walking**, so the parts and the digest `seededGraph` stores are over the
 * same reads by construction rather than by two functions agreeing. A node's path is its compiled id, which
 * derives from the flow's name — the determinism `collidingOwner` also rests on.
 */
function graphParts([flow, nodes, relations]: GraphState): Record<string, string> {
  return {
    fields: hashValues([flow]),
    ...Object.fromEntries(nodes.map(([id, values]) => [`node:${id}`, hashValues([values])])),
    edges: hashValues([relations]),
  };
}

/** Records a newly imported flow's seeded graph, and hands back the parts that graph is made of */
function stampSeededGraph(flowId: EARS.EntityId, compiled: CompiledRows): Record<string, string> {
  const rows = compiled.entity as Array<Record<string, unknown> & { id: string }>;
  const fieldsOf = (id: string) => Object.keys(rows.find((row) => row.id === id) ?? {}).filter((key) => !ROW_KEYS.has(key)).sort();
  const nodeIds = compiled.relation.filter((r) => r.source === flowId && r.kind === EARS.RelKind.CONTAINS).map((r) => r.target);
  const sources = new Set([flowId, ...nodeIds]);
  const seeded = {
    flowFields: fieldsOf(flowId),
    nodeFields: Object.fromEntries(nodeIds.map((id) => [id, fieldsOf(id)])),
    relKinds: [...new Set(compiled.relation.filter((r) => sources.has(r.source)).map((r) => r.kind))].sort(),
  };
  const state = graphState(flowId, seeded);
  untypedTx(flowId).update(SEEDED_GRAPH, { ...seeded, hash: hashValues(state) } satisfies SeededGraph);
  return graphParts(state);
}

/**
 * The parts of a recorded flow whose value in the database is no longer what we wrote.
 *
 * Beside `driftedFieldParts` (`seeder.ts`) rather than one function over both, because a flow's parts and an
 * entity's are produced by different walks; each derivation lives with the writer that produced it.
 */
export function driftedGraphParts(item: AppliedItem, flowId: EARS.EntityId): string[] {
  const seeded = ears().getAttr(flowId, SEEDED_GRAPH) as SeededGraph | null;
  if (!seeded) return Object.keys(item.parts).sort();
  const live = graphParts(graphState(flowId, seeded));
  return [...new Set([...Object.keys(item.parts), ...Object.keys(live)])]
    .filter((path) => live[path] !== item.parts[path])
    .sort();
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
    apply(ctx: ImportContext): ImportCounts {
      const counts: ImportCounts = { created: 0, updated: 0, skipped: 0 };
      const flowsDSL: any = loadJSON(seedPath(ctx.compiledDir, 'flows'));
      if (!flowsDSL) {
        ctx.log('  flows artifact not found, skipping flows');
        return counts;
      }

      const packId = seedPackId(ctx.compiledDir);

      if (ctx.mode === 'wipe-and-replace') {
        for (const flow of ears().findAll<FlowEntity>(EARS.Entity.Flow)) {
          try { flowRepository.deleteFlow(flow.id); } catch {}
        }
        ctx.log('  flows wiped');
      }

      /**
       * The flow seeded from this DSL entry, however it's been renamed; otherwise a flow without a seed key
       * that has its label (a user's flow), so a seed never adds a copy beside it.
       */
      const lookupSeeded = (flows: FlowEntity[], name: string): FlowEntity | undefined => {
        const seedKey = flowSeedKey(packId, name);
        return flows.find((flow) => ears().getAttr(flow.id, SEED_KEY) === seedKey)
          ?? flows.find((flow) => flow.label === name && ears().getAttr(flow.id, SEED_KEY) === null);
      };
      const existingFlows = ears().findAll<FlowEntity>(EARS.Entity.Flow);
      const actionMap = buildLabelMap(ears().findAll<ActionEntity>(EARS.Entity.Action));
      const promptMap = buildLabelMap(promptRepository.all());

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
        const taken = ids.find((id) => !ownIds.has(id) && ears().findByIdRaw(id as EARS.EntityId));
        if (!taken) return undefined;
        const flowId = findRelations({ targetEntity: taken as EARS.EntityId, relationType: EARS.RelKind.CONTAINS })[0]?.sourceEntity ?? taken;
        const seedKey = ears().getAttr(flowId as EARS.EntityId, SEED_KEY) as string | null;
        return seedKey ? `seeded by ${seedKey.slice(0, seedKey.indexOf(':'))}` : 'created by the user';
      };

      const validFlowDSL: Record<string, any> = {};
      const replacedLabels = new Set<string>();

      for (const [key, entry] of Object.entries(flowsDSL as Record<string, any>)) {
        if (!shouldImportAll(ctx.include) && !(ctx.include as ReadonlySet<string>).has(key)) {
          continue;
        }

        const validation = validate({ [key]: entry }, {
          actions: Array.from(actionMap.keys()),
          prompts: Array.from(promptMap.keys()),
          // Validated one at a time, so a subflow naming a sibling would otherwise resolve to nothing
          flowNames: Object.keys(flowsDSL as Record<string, unknown>),
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
        const seedKey = flowSeedKey(packId, key);
        defineSeedKey(ctx, seedKey);

        // A flow is destroyed rather than trashed (`flowRepository.deleteFlow`), so this record is the only
        // one its deletion leaves
        if (!existing && removedByUser(ctx, seedKey)) {
          ctx.log(`  flow skipped (removed): ${key}`);
          counts.skipped++;
          continue;
        }

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
          const seeded = ears().getAttr(existing.id, SEEDED_GRAPH) as SeededGraph | null;
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
            flowRepository.deleteFlow(existing.id, { allowRoot: true });
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
        const flows = ears().findAll<FlowEntity>(EARS.Entity.Flow);
        const seededIds = new Set<string>();
        const targets = new Map<string, string>();
        for (const name of Object.keys(flowsDSL)) {
          const seedKey = flowSeedKey(packId, name);
          const seeded = flows.find((flow) => ears().getAttr(flow.id, SEED_KEY) === seedKey);
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
      flowRepository.importFromDSL(compiled);
      for (const name of flowNames) {
        const row = (compiled.entity as Array<{ id: string; entityType?: string; label?: string }>)
          .find((entity) => entity.entityType === EARS.Entity.Flow && entity.label === name);
        if (row) {
          const flowId = row.id as EARS.EntityId;
          const seedKey = flowSeedKey(packId, name);
          untypedTx(flowId).update(SEED_KEY, seedKey);
          const parts = stampSeededGraph(flowId, compiled);
          const sourceHash = ears().getAttr(flowId, 'sourceHash' as EARS.AttrKind);
          recordApplied(ctx, seedKey, {
            entityType: EARS.Entity.Flow,
            ...(typeof sourceHash === 'string' && { sourceHash }),
            parts,
          });
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
