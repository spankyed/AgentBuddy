import { flowRepository } from '../repositories/flow-repository.ts';
import { promptRepository } from '../repositories/prompt-repository.ts';
import { findRelations, installedEngine as ears, untypedTx } from '@apack/ears';
import { loadJSON, selectsAll, type ContentApplier, type ApplyContext, type ApplyResult, type AppliedItem } from '../utils/index.ts';
import { contentPath } from '../build/manifest.ts';
import { compile as compileFlowDSL } from '../build/compilers/flow-compiler.ts';
import { validate } from '../build/compilers/flow-dsl-validator.ts';
import { isFlowConfig, type FlowDSL } from '../build/compilers/flow-types.ts';
import { EARS } from '../types/entities.ts';
import type { ActionEntity, FlowEntity } from '../types/sdk-entities.ts';
import type { ContentEditPolicy } from '../build/manifest-schema.ts';
import { childContentKey, defineKey, hashValues, recordApplied, CONTENT_KEY, contentKeyPrefix, CONTENT_HASH } from './format-applier.ts';
import { resolve, resolveRemoval, type LiveEntity } from './merge.ts';
import { contentPackId } from '../utils/apply.ts';

/**
 * What a flow's parts are **not** over: an entity's own id, when it was written, and the two attributes the
 * apply stamps on it. Everything else a flow or one of its nodes holds is content.
 */
const ROW_KEYS = new Set(['id', 'createdAt', 'contentHash', 'contentKey']);

/**
 * The relation kinds a flow's structure is made of. `flow-compiler.ts` emits these two and no others, which
 * `tests/content/flow-applier.spec.ts` holds against its output, so filtering to them is what keeps a flow's
 * `edges` part about the flow rather than about whatever a running app later links from one of its nodes.
 */
export const GRAPH_REL_KINDS: readonly string[] = [EARS.RelKind.CONTAINS, EARS.RelKind.TRANSITIONS_TO];

/** A flow's three parts as stored now: its own values, each node's, and its edges */
type GraphState = [Array<[string, unknown]>, Array<[string, Array<[string, unknown]>]>, string[]];

/** An entity's content as stored now: every attribute but the four that say which or when */
function contentOf(id: EARS.EntityId): Array<[string, unknown]> {
  const row = ears().findByIdRaw(id) as Record<string, unknown> | null;
  return Object.entries(row ?? {}).filter(([field]) => !ROW_KEYS.has(field)).sort(([a], [b]) => (a < b ? -1 : 1));
}

/**
 * The flow's rows as stored now, independent of relation order.
 *
 * **It reads the entities rather than a recorded list of their fields**, which is what makes the apply that
 * wrote a flow and the apply that reads it back agree by construction: both ask the database the same
 * question a moment apart. A stored field list was the other option and it hid exactly the edit worth
 * catching — a field the user added to a node was not in the list, so it was not in the digest.
 */
function graphState(flowId: EARS.EntityId): GraphState {
  const nodeIds = findRelations({ sourceEntity: flowId, relationType: EARS.RelKind.CONTAINS }).map((r) => r.targetEntity as string).sort();
  const relations = [flowId, ...nodeIds]
    .flatMap((source) => findRelations({ sourceEntity: source as EARS.EntityId }))
    .filter((r) => GRAPH_REL_KINDS.includes(r.relationType))
    .map((r) => JSON.stringify([r.sourceEntity, r.relationType, r.targetEntity, r.info ?? null]))
    .sort();
  return [contentOf(flowId), nodeIds.map((id) => [id, contentOf(id as EARS.EntityId)]), relations];
}

/**
 * The walk's three parts, a hash each (`AppliedItem.parts`, `@apack/sdk/utils`): the flow's own fields, each
 * node's values as one unit, and the whole edge set with each edge's `info`.
 *
 * A node's path is its compiled id, which derives from the flow's name — the determinism `collidingOwner`
 * also rests on. Nothing goes inside a node: edit a step's parameters and what the user is told is that the
 * step changed, which is what someone deciding whether to take a new version needs.
 */
function graphParts([flow, nodes, relations]: GraphState): Record<string, string> {
  return {
    fields: hashValues([flow]),
    ...Object.fromEntries(nodes.map(([id, values]) => [`node:${id}`, hashValues([values])])),
    edges: hashValues([relations]),
  };
}

/**
 * The parts of a recorded flow whose value in the database is no longer what we wrote.
 *
 * Beside `driftedFieldParts` (`format-applier.ts`) rather than one function over both, because a flow's parts and an
 * entity's are produced by different walks; each derivation lives with the writer that produced it. A node
 * the user added or deleted appears as a path on one side only, which the union over both sides is for.
 */
export function driftedGraphParts(item: AppliedItem, flowId: EARS.EntityId): string[] {
  const live = graphParts(graphState(flowId));
  return [...new Set([...Object.keys(item.parts), ...Object.keys(live)])]
    .filter((path) => live[path] !== item.parts[path])
    .sort();
}

/** A DSL entry's content key: the writing pack, then the entry key and the flow's name in the source */
const flowContentKey = (packId: string, name: string) => `${contentKeyPrefix(packId)}${childContentKey('flows', { entity: EARS.Entity.Flow, label: name }, ['label'])}`;

function buildLabelMap(entities: Array<{ label: string; id: EARS.EntityId }>): Map<string, string> {
  return new Map(entities.map((e) => [e.label, e.id]));
}

export interface FlowApplierOptions {
  /** The `flows` entry's `onUserEdit`; see `ContentSourceSchema` */
  onUserEdit?: ContentEditPolicy;
}

export function createFlowApplier(options: FlowApplierOptions = {}): ContentApplier {
  return {
    key: 'flows',
    apply(ctx: ApplyContext): ApplyResult {
      const counts: ApplyResult = { created: 0, updated: 0, skipped: 0 };
      const flowsDSL: any = loadJSON(contentPath(ctx.compiledDir, 'flows'));
      if (!flowsDSL) {
        ctx.log('  flows artifact not found, skipping flows');
        return counts;
      }

      const packId = contentPackId(ctx.compiledDir);

      if (ctx.mode === 'wipe-and-replace') {
        for (const flow of ears().findAll<FlowEntity>(EARS.Entity.Flow)) {
          try { flowRepository.deleteFlow(flow.id); } catch {}
        }
        ctx.log('  flows wiped');
      }

      /**
       * The flow written from this DSL entry, however it's been renamed; otherwise a flow without a content key
       * that has its label (a user's flow), so an apply never adds a copy beside it.
       */
      const lookupWritten = (flows: FlowEntity[], name: string): FlowEntity | undefined => {
        const contentKey = flowContentKey(packId, name);
        return flows.find((flow) => ears().getAttr(flow.id, CONTENT_KEY) === contentKey)
          ?? flows.find((flow) => flow.label === name && ears().getAttr(flow.id, CONTENT_KEY) === null);
      };
      const existingFlows = ears().findAll<FlowEntity>(EARS.Entity.Flow);
      const actionMap = buildLabelMap(ears().findAll<ActionEntity>(EARS.Entity.Action));
      const promptMap = buildLabelMap(promptRepository.all());

      /**
       * Who owns the flow a DSL entry would overwrite: flow and node ids derive from the flow's name, so
       * another pack's flow with that name, or a user's flow with those ids, would be written over. The
       * flow this apply replaces isn't a collision.
       */
      const collidingOwner = (name: string, entry: FlowDSL[string], replacing: FlowEntity | undefined): string | undefined => {
        const ownIds = new Set<string>(replacing
          ? [replacing.id, ...findRelations({ sourceEntity: replacing.id, relationType: EARS.RelKind.CONTAINS }).map((r) => r.targetEntity)]
          : []);
        const ids = (compileFlowDSL({ [name]: entry }, { actions: actionMap, prompts: promptMap }).entity as Array<{ id: string }>).map((row) => row.id);
        const taken = ids.find((id) => !ownIds.has(id) && ears().findByIdRaw(id as EARS.EntityId));
        if (!taken) return undefined;
        const flowId = findRelations({ targetEntity: taken as EARS.EntityId, relationType: EARS.RelKind.CONTAINS })[0]?.sourceEntity ?? taken;
        const contentKey = ears().getAttr(flowId as EARS.EntityId, CONTENT_KEY) as string | null;
        return contentKey ? `written by ${contentKey.slice(0, contentKey.indexOf(':'))}` : 'created by the user';
      };

      const validFlowDSL: Record<string, any> = {};
      const replacedLabels = new Set<string>();

      /**
       * **Every flow this content declares, before anything is written.** The loop below stops at a flow it
       * means to keep in half a dozen ways — an entry that fails to validate, one the mode skips, one the
       * user owns, one whose ids collide — and a key the loop never reached is still a key the pack ships.
       * Reading "not reached" as "no longer shipped" would have `removals` delete exactly the flow each of
       * those branches exists to protect, an invalid entry most of all: ship one broken flow and the user
       * loses the flow they had.
       */
      for (const name of Object.keys(flowsDSL as Record<string, unknown>)) defineKey(ctx, flowContentKey(packId, name));

      for (const [key, entry] of Object.entries(flowsDSL as Record<string, any>)) {
        if (!selectsAll(ctx.include) && !(ctx.include as ReadonlySet<string>).has(key)) {
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
          console.error(`[content] ${message}`);
          (counts.errors ??= []).push(message);
          continue;
        }

        const existing = lookupWritten(existingFlows, key);
        const compiledHash = isFlowConfig(entry) ? (entry as any).contentHash : undefined;
        const contentKey = flowContentKey(packId, key);
        const applied = ctx.applied?.before.get(contentKey);
        // A flow is destroyed rather than trashed (`flowRepository.deleteFlow`), so there is no trashed case
        // here: no flow means no flow, and what says whether the user removed it is the record
        const { resolution, parts, offer } = resolve({
          applied,
          ...(compiledHash !== undefined && { incoming: compiledHash as string }),
          ...(existing !== undefined && { live: { contentHash: existing.contentHash } as LiveEntity }),
          ...(ctx.mode !== undefined && { mode: ctx.mode }),
          ...(options.onUserEdit !== undefined && { onUserEdit: options.onUserEdit }),
          ...(ctx.force === true && { force: true }),
          drifted: () => (applied && existing ? driftedGraphParts(applied, existing.id) : []),
        });

        if (resolution !== 'create' && resolution !== 'fast-forward') {
          counts.skipped++;
          if (resolution === 'conflict') {
            if (offer) {
              ctx.applied?.offers.set(contentKey, {
                kind: 'update', parts: parts ?? [],
                ...(typeof compiledHash === 'string' && { contentHash: compiledHash }),
              });
            }
            ctx.log(`  flow skipped (edited: ${(parts ?? []).join(', ')}): ${key}`);
          } else if (resolution === 'absent-by-deletion') {
            ctx.log(`  flow skipped (removed): ${key}`);
          } else if (resolution === 'kept') {
            ctx.log(`  flow skipped (existing): ${key}`);
          } else if (resolution === 'user-owned') {
            ctx.log(`  flow skipped (user-owned): ${key}`);
          } else {
            ctx.log(`  flow unchanged (hash match): ${key}`);
          }
          continue;
        }

        const owner = collidingOwner(key, entry, existing);
        if (owner) {
          const message = `Flow "${key}": a flow with this name already exists (${owner})`;
          console.error(`[content] ${message}`);
          (counts.errors ??= []).push(message);
          continue;
        }

        if (existing) {
          try {
            // The flow writer's whole-item write is a delete and a re-import, since a flow's nodes and
            // wiring arrive together
            flowRepository.deleteFlow(existing.id, { allowRoot: true });
            replacedLabels.add(key);
            ctx.log(`  flow replaced (hash mismatch): ${key}`);
          } catch (error: any) {
            console.warn(`[content] Failed to replace the content flow "${existing.label}":`, error?.message);
            ctx.log(`  flow skipped: ${key}`);
            counts.skipped++;
            continue;
          }
        }
        validFlowDSL[key] = entry;
      }

      /**
       * The flows a subflow step can name that this apply doesn't (re)import, such as an unchanged flow
       * or a dependency's. A flow this pack's content declares is the flow it wrote, found by content key however
       * it's been renamed, never another flow with its label. When it wrote no flow (the apply left
       * a user's or another pack's flow with that name alone), the name runs that flow; other names
       * resolve by label.
       */
      const subflowTargets = (): Map<string, string> => {
        const flows = ears().findAll<FlowEntity>(EARS.Entity.Flow);
        const writtenIds = new Set<string>();
        const targets = new Map<string, string>();
        for (const name of Object.keys(flowsDSL)) {
          const contentKey = flowContentKey(packId, name);
          const written = flows.find((flow) => ears().getAttr(flow.id, CONTENT_KEY) === contentKey);
          if (!written) continue;
          targets.set(name, written.id);
          writtenIds.add(written.id);
        }
        for (const flow of flows) {
          if (!writtenIds.has(flow.id) && !targets.has(flow.label)) targets.set(flow.label, flow.id);
        }
        return targets;
      };

      /**
       * The flows this apply wrote that the content no longer declares: removed while they are still ours,
       * kept and flagged once the user has edited one. The conditions are the generic writer's
       * (`format-applier.ts`'s `removals`), and for the same reasons: a file that did not load reaches none of
       * this, and an import carries no record.
       */
      const removals = () => {
        const record = ctx.applied;
        if (!record) return;
        const prefix = `${contentKeyPrefix(packId)}flows/`;
        for (const itemKey of [...record.before.keys()].filter((k) => k.startsWith(prefix) && !record.defined.has(k))) {
          const item = record.before.get(itemKey)!;
          const flow = ears().findAll<FlowEntity>(EARS.Entity.Flow).find((f) => ears().getAttr(f.id, CONTENT_KEY) === itemKey);
          const { resolution, parts, offer } = resolveRemoval({
            applied: item,
            ...(flow !== undefined && { live: { contentHash: flow.contentHash } as LiveEntity }),
            ...(options.onUserEdit !== undefined && { onUserEdit: options.onUserEdit }),
            drifted: () => (flow ? driftedGraphParts(item, flow.id) : []),
          });
          if (resolution === 'removed-but-edited') {
            if (offer) record.offers.set(itemKey, { kind: 'removed', parts: parts ?? [] });
            ctx.log(`  flow kept (dropped from the content, and edited): ${itemKey}`);
            continue;
          }
          try {
            if (flow) flowRepository.deleteFlow(flow.id, { allowRoot: true });
            record.removed.add(itemKey);
            ctx.log(`  flow removed (dropped from the content): ${itemKey}`);
          } catch (err) {
            (counts.errors ??= []).push(`Flow "${itemKey}": ${(err as Error)?.message ?? String(err)}`);
          }
        }
      };

      const flowNames = Object.keys(validFlowDSL);
      if (flowNames.length === 0) {
        ctx.log('  no flows to import');
        removals();
        return counts;
      }

      const compiled = compileFlowDSL(validFlowDSL, { actions: actionMap, prompts: promptMap, flows: subflowTargets() });
      flowRepository.importFromDSL(compiled);
      for (const name of flowNames) {
        const row = (compiled.entity as Array<{ id: string; entityType?: string; label?: string }>)
          .find((entity) => entity.entityType === EARS.Entity.Flow && entity.label === name);
        if (row) {
          const flowId = row.id as EARS.EntityId;
          const contentKey = flowContentKey(packId, name);
          untypedTx(flowId).update(CONTENT_KEY, contentKey);
          // Read back off the entities a moment after writing them, which is what makes this and
          // `driftedGraphParts` two reads of one question rather than two accounts of it
          const parts = graphParts(graphState(flowId));
          const contentHash = ears().getAttr(flowId, CONTENT_HASH);
          recordApplied(ctx, contentKey, {
            entityType: EARS.Entity.Flow,
            ...(typeof contentHash === 'string' && { contentHash }),
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
      removals();
      return counts;
    },
  };
}
