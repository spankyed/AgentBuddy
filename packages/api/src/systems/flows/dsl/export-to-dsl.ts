#!/usr/bin/env node
/**
 * Export EARS Flows to DSL (Track-Based Format)
 *
 * Extracts all flows and nodes from the EARS database and converts them
 * to the track-based DSL format.
 *
 * Usage: npm run dsl:export
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { hydrateSharded } from '@/persistence/partitioning/hydrate-sharded';
import { envs, policy, persistence, closePersistence } from '@/core/ears/attribute-storage';
import { qx } from '@/core/ears/helpers/query';
import { edgeStore } from '@/core/ears/helpers/edge-store';
import { EARS } from '@/core/types';
import type {
  FlowDSL,
  Track,
  DSLStepNode,
  DSLActionNode,
  DSLLLMNode,
  DSLSwitchNode,
  DSLFireNode,
  DSLTransformNode,
  DSLQueryNode,
  DSLFlowNode,
  DSLCreateNode,
  DSLUpdateNode,
  DSLKeepAliveNode,
} from './types';
import type {
  NodeEntity,
  EdgeEntity,
  FlowEntity,
  ListenNode,
  ActionNode,
  LLMNode,
  SwitchNode,
  FireNode,
  TransformNode,
  QueryNode,
  FlowNode,
  CreateNode,
  UpdateNode,
  KeepAliveNode
} from '../config/types';
import type { ActionEntity } from '@/systems/actions/types';
import type { PromptEntity } from '@/systems/prompts/types';

// Use process.cwd() relative path since this runs from api package
const DSL_DIR = path.resolve(process.cwd(), 'src/systems/flows/dsl');

// Edge kinds for flow transitions
const FLOW_EDGE_KINDS = [EARS.RelKind.TRANSITIONS_TO] as const;

/*─────────────────────────────────────────────────────────────────
 * Field Mapping Conversion
 *─────────────────────────────────────────────────────────────────*/

function collapseFieldMappings(
  fieldMappings?: Array<{ target: string; source: string }>
): Record<string, string> | undefined {
  if (!fieldMappings || fieldMappings.length === 0) return undefined;

  const map: Record<string, string> = {};
  for (const { target, source } of fieldMappings) {
    map[target] = source;
  }
  return map;
}

/*─────────────────────────────────────────────────────────────────
 * Database Queries (avoiding circular imports)
 *─────────────────────────────────────────────────────────────────*/

function getFlowNodes(flowId: EARS.EntityId): NodeEntity[] {
  const nodeIds = qx(flowId)
    .links(EARS.RelKind.CONTAINS, EARS.Entity.Node)
    .map(({ id }) => id);

  const nodes = qx(nodeIds).pickAll() as unknown as NodeEntity[];

  // Hydrate action/prompt relationships
  return nodes.map(node => {
    if (node.nodeType === 'action' || node.nodeType === 'llm') {
      const linkedId = qx(node.id)
        .links(EARS.RelKind.INSTANCE_OF)
        .map(({ id }) => id)[0];

      if (linkedId) {
        if (node.nodeType === 'action') {
          return { ...node, actionId: linkedId };
        } else {
          return { ...node, promptTemplateId: linkedId };
        }
      }
    }
    return node;
  });
}

function getFlowEdges(flowId: EARS.EntityId): EdgeEntity[] {
  const nodes = getFlowNodes(flowId);
  const nodeIds = nodes.map(n => n.id).filter(Boolean) as EARS.EntityId[];

  const seen = new Set<string>();
  const edges: EdgeEntity[] = [];

  for (const source of nodeIds) {
    qx(source)
      .links(FLOW_EDGE_KINDS, [EARS.Entity.Node])
      .filter(({ id: targetId }) => nodeIds.includes(targetId))
      .forEach(({ relation, id: target }) => {
        const relId = edgeStore.relIds({
          sourceEntity: source,
          relationType: relation,
          targetEntity: target,
        })[0];

        if (seen.has(relId)) return;
        seen.add(relId);

        edges.push({
          id: relId,
          kind: relation,
          source,
          target,
          info: {},
        });
      });
  }

  return edges;
}

/*─────────────────────────────────────────────────────────────────
 * Step Node Decompilation
 *─────────────────────────────────────────────────────────────────*/

function decompileStepNode(
  node: NodeEntity,
  actionMap: Map<string, string>,
  promptMap: Map<string, string>,
  flowMap: Map<string, string>
): DSLStepNode {
  switch (node.nodeType) {
    case 'action': {
      const actionNode = node as ActionNode;
      const actionLabel = actionNode.actionId
        ? actionMap.get(actionNode.actionId) || actionNode.actionId
        : 'Unknown Action';

      const dsl: DSLActionNode = {
        type: 'action',
        action: actionLabel,
      };

      // Add optional base fields
      if (node.label && node.label !== actionLabel) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
      if (node.final) dsl.final = true;

      const map = collapseFieldMappings(actionNode.fieldMappings);
      if (map) dsl.map = map;
      if (actionNode.params && Object.keys(actionNode.params).length > 0) {
        dsl.params = actionNode.params;
      }

      return dsl;
    }

    case 'llm': {
      const llmNode = node as LLMNode;
      const promptLabel = llmNode.promptTemplateId
        ? promptMap.get(llmNode.promptTemplateId) || llmNode.promptTemplateId
        : llmNode.prompt || 'Unknown Prompt';

      const dsl: DSLLLMNode = {
        type: 'llm',
        prompt: promptLabel,
      };

      // Add optional base fields
      if (node.label && node.label !== promptLabel) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
      if (node.final) dsl.final = true;

      const map = collapseFieldMappings(llmNode.fieldMappings);
      if (map) dsl.map = map;
      if (llmNode.model) dsl.model = llmNode.model;
      if (llmNode.temperature !== undefined) dsl.temperature = llmNode.temperature;
      if (llmNode.maxTokens !== undefined) dsl.maxTokens = llmNode.maxTokens;
      if (llmNode.systemPrompt) dsl.systemPrompt = llmNode.systemPrompt;

      return dsl;
    }

    case 'switch': {
      const switchNode = node as SwitchNode;

      // Map BinaryOperator enum values back to DSL symbols
      const operatorToDsl: Record<string, string> = {
        equals: '==',
        not_equals: '!=',
        greater_than: '>',
        less_than: '<',
        greater_than_or_equals: '>=',
        less_than_or_equals: '<=',
        contains: 'contains',
        starts_with: 'starts_with',
        ends_with: 'ends_with',
        matches: 'matches',
        is_empty: 'is_empty',
        is_null: 'is_null',
      };

      const dsl: DSLSwitchNode = {
        type: 'switch',
        conditions: switchNode.conditions.map(c => {
          let ifExpr = '';
          if (c.predicate && typeof c.predicate !== 'function') {
            // Decompile structured predicate back to DSL expression string
            const opSymbol = operatorToDsl[c.predicate.operator] || c.predicate.operator;
            // Unary operators don't need a value
            if (c.predicate.operator === 'is_empty' || c.predicate.operator === 'is_null') {
              ifExpr = `${c.predicate.key} ${opSymbol}`;
            } else {
              ifExpr = `${c.predicate.key} ${opSymbol} ${c.predicate.value ?? ''}`;
            }
          } else if (typeof c.predicate === 'function') {
            ifExpr = '[custom function]';
          }
          return {
            if: ifExpr,
            then: c.label || '',
          };
        }),
      };

      // Add optional base fields
      if (node.label) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
      if (node.final) dsl.final = true;

      if (switchNode.elseLabel) dsl.else = switchNode.elseLabel;
      return dsl;
    }

    case 'fire': {
      const fireNode = node as FireNode;
      const dsl: DSLFireNode = {
        type: 'fire',
        event: fireNode.eventType,
      };

      // Add optional base fields
      if (node.label && node.label !== fireNode.eventType) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
      if (node.final) dsl.final = true;

      if (fireNode.scope && fireNode.scope !== 'local') dsl.scope = fireNode.scope;
      if (fireNode.payload !== undefined) dsl.payload = fireNode.payload;
      return dsl;
    }

    case 'transform': {
      const transformNode = node as TransformNode;
      const dsl: DSLTransformNode = {
        type: 'transform',
        script: transformNode.script,
      };

      // Add optional base fields
      if (node.label) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
      if (node.final) dsl.final = true;

      if (transformNode.outputType && transformNode.outputType !== 'json') {
        dsl.outputType = transformNode.outputType;
      }
      return dsl;
    }

    case 'query': {
      const queryNode = node as QueryNode;
      const dsl: DSLQueryNode = {
        type: 'query',
        prompt: queryNode.prompt,
      };

      // Add optional base fields
      if (node.label) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
      if (node.final) dsl.final = true;

      if (queryNode.resultKey) dsl.as = queryNode.resultKey;
      return dsl;
    }

    case 'flow': {
      const flowNode = node as FlowNode;
      const flowLabel = flowMap.get(flowNode.flowRef) || flowNode.flowRef;
      const dsl: DSLFlowNode = {
        type: 'flow',
        flow: flowLabel,
      };

      // Add optional base fields
      if (node.label && node.label !== flowLabel) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
      if (node.final) dsl.final = true;

      if (flowNode.propagateCtx === false) dsl.inherit = false;
      const map = collapseFieldMappings(flowNode.fieldMappings);
      if (map) dsl.map = map;
      return dsl;
    }

    case 'create': {
      const createNode = node as CreateNode;
      const dsl: DSLCreateNode = {
        type: 'create',
        entity: createNode.entityTypeTarget,
      };

      // Add optional base fields
      if (node.label) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
      if (node.final) dsl.final = true;

      return dsl;
    }

    case 'update': {
      const updateNode = node as UpdateNode;
      const dsl: DSLUpdateNode = {
        type: 'update',
        target: updateNode.entityId,
      };

      // Add optional base fields
      if (node.label) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
      if (node.final) dsl.final = true;

      if (updateNode.onMissing) dsl.onMissing = updateNode.onMissing;
      return dsl;
    }

    case 'keep_alive': {
      const dsl: DSLKeepAliveNode = {
        type: 'keep_alive',
      };

      // Add optional base fields
      if (node.label) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
      if (node.final) dsl.final = true;

      return dsl;
    }

    default:
      console.warn(`Unknown node type: ${(node as any).nodeType}`);
      return {
        type: 'action',
        action: 'Unknown',
        label: node.label,
      };
  }
}

/*─────────────────────────────────────────────────────────────────
 * Track Reconstruction
 *─────────────────────────────────────────────────────────────────*/

interface TrackBuilder {
  listenNode: ListenNode;
  steps: NodeEntity[];
}

function buildTracksFromGraph(
  nodes: NodeEntity[],
  edges: EdgeEntity[],
  actionMap: Map<string, string>,
  promptMap: Map<string, string>,
  flowMap: Map<string, string>
): Track[] {
  // Find all listen nodes
  const listenNodes = nodes.filter(n => n.nodeType === 'listen') as ListenNode[];
  const nonListenNodes = nodes.filter(n => n.nodeType !== 'listen');

  // Build outgoing edge map: nodeId → [targetIds]
  const outgoingEdges = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = outgoingEdges.get(edge.source) || [];
    targets.push(edge.target);
    outgoingEdges.set(edge.source, targets);
  }

  // Build tracks by following edges from each listen node
  const tracks: Track[] = [];
  const listenNodeIds = new Set(listenNodes.map(n => n.id as string));

  // Track used labels to ensure uniqueness
  const usedLabels = new Set<string>();

  for (const listenNode of listenNodes) {
    const steps: NodeEntity[] = [];
    const visited = new Set<string>();

    // BFS/DFS from listen node to collect sequential steps
    function collectSteps(nodeId: string) {
      if (visited.has(nodeId)) return;
      if (listenNodeIds.has(nodeId) && nodeId !== listenNode.id) return; // Stop at other listen nodes

      visited.add(nodeId);

      const targets = outgoingEdges.get(nodeId) || [];
      for (const targetId of targets) {
        const targetNode = nodes.find(n => n.id === targetId);
        if (!targetNode) continue;

        // Don't follow to other listen nodes
        if (targetNode.nodeType === 'listen') continue;

        steps.push(targetNode);
        collectSteps(targetId);
      }
    }

    collectSteps(listenNode.id as string);

    // Convert steps to DSL format
    const dslSteps = steps.map(step =>
      decompileStepNode(step, actionMap, promptMap, flowMap)
    );

    // Build track
    const track: Track = {
      event: listenNode.eventType,
      steps: dslSteps,
    };

    // Determine the label - use node label if set, otherwise derive from event
    let label = listenNode.label || listenNode.eventType;

    // Ensure label uniqueness by appending suffix if needed
    let uniqueLabel = label;
    let counter = 2;
    while (usedLabels.has(uniqueLabel)) {
      uniqueLabel = `${label} ${counter}`;
      counter++;
    }
    usedLabels.add(uniqueLabel);

    // Always set an explicit label to avoid validator deriving duplicates
    track.label = uniqueLabel;

    if (listenNode.description) {
      track.description = listenNode.description;
    }

    tracks.push(track);
  }

  return tracks;
}

/*─────────────────────────────────────────────────────────────────
 * Flow Decompilation
 *─────────────────────────────────────────────────────────────────*/

function decompileFlow(
  flow: FlowEntity,
  actionMap: Map<string, string>,
  promptMap: Map<string, string>,
  flowMap: Map<string, string>
): { name: string; tracks: Track[] } {
  const nodes = getFlowNodes(flow.id);
  const edges = getFlowEdges(flow.id);

  const tracks = buildTracksFromGraph(nodes, edges, actionMap, promptMap, flowMap);

  return {
    name: flow.label,
    tracks,
  };
}

/*─────────────────────────────────────────────────────────────────
 * Main Export Function
 *─────────────────────────────────────────────────────────────────*/

async function exportAllFlows() {
  console.log('🔄 Initializing database...');

  await hydrateSharded({
    envs,
    policy,
    shardedPersistence: persistence
  });

  console.log('✅ Database initialized\n');

  // Build lookup maps
  const actions = qx(EARS.Entity.Action).pickAll() as unknown as ActionEntity[];
  const prompts = qx(EARS.Entity.Prompt).pickAll() as unknown as PromptEntity[];

  const actionMap = new Map<string, string>();
  for (const action of actions) {
    actionMap.set(action.id, action.label);
  }

  const promptMap = new Map<string, string>();
  for (const prompt of prompts) {
    promptMap.set(prompt.id, prompt.label);
  }

  const flows = qx(EARS.Entity.Flow).pickAll() as unknown as FlowEntity[];

  const flowMap = new Map<string, string>();
  for (const flow of flows) {
    flowMap.set(flow.id, flow.label);
  }

  console.log(`📊 Found ${flows.length} flows, ${actions.length} actions, ${prompts.length} prompts\n`);

  // Decompile each flow to track-based DSL
  const dsl: FlowDSL = {};
  let skipped = 0;

  for (const flow of flows) {
    console.log(`  Processing: ${flow.label}`);
    const { name, tracks } = decompileFlow(flow, actionMap, promptMap, flowMap);

    // Skip empty flows (no tracks)
    if (tracks.length === 0) {
      console.log(`    ⚠️  Skipping empty flow: ${flow.label}`);
      skipped++;
      continue;
    }

    dsl[name] = tracks;
  }

  if (skipped > 0) {
    console.log(`\n⚠️  Skipped ${skipped} empty flow(s)`);
  }

  // Write output
  const outputPath = path.join(DSL_DIR, 'examples', 'exported-flows.json');

  const examplesDir = path.dirname(outputPath);
  if (!fs.existsSync(examplesDir)) {
    fs.mkdirSync(examplesDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(dsl, null, 2));

  console.log(`\n✅ Exported ${flows.length} flows to ${outputPath}`);

  closePersistence();
}

// Run
exportAllFlows().catch(error => {
  console.error('Export failed:', error);
  process.exit(1);
});
