/**
 * Reusable DSL Export Function
 *
 * Converts EARS flows to the track-based DSL format.
 * Safe to import from the running server (no CLI side effects).
 */

import { createExportDir, ensureDirectoryExists } from '@/core/shared/paths';
import { writeExportJson } from '@/core/shared/export';
import { qx } from '@/core/ears/helpers/query';
import { edgeStore } from '@/core/ears/helpers/edge-store';
import { EARS } from '@/core/types';
import { FLOW_ROLES } from '../repository/index';
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
  DSLKillNode,
} from './types';
import type {
  NodeEntity,
  EdgeEntity,
  FlowEntity,
  ListenerNode,
  ScheduleNode,
  ActionNode,
  LLMNode,
  SwitchNode,
  FireNode,
  TransformNode,
  QueryNode,
  FlowNode,
  CreateNode,
  UpdateNode,
} from '../config/types';
import type { ActionEntity } from '@/core/shared-types/actions';
import type { PromptEntity } from '@/core/shared-types/prompts';

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

        if (!relId || seen.has(relId)) return;
        seen.add(relId);

        const relDetails = edgeStore.find({
          sourceEntity: source,
          relationType: relation,
          targetEntity: target,
        })[0];

        edges.push({
          id: relId,
          kind: relation,
          source,
          target,
          info: (relDetails?.info as Record<string, unknown>) || {},
        });
      });
  }

  return edges;
}

/*─────────────────────────────────────────────────────────────────
 * Inline Branch Detection
 *─────────────────────────────────────────────────────────────────*/

interface DecompileGraphCtx {
  nodes: NodeEntity[];
  edges: EdgeEntity[];
  triggerNodeIds: Set<string>;
  inlinedNodeIds: Set<string>;
  incomingEdges: Map<string, string[]>;   // target -> [sources]
  outgoingEdges: Map<string, string[]>;   // source -> [targets]
  actionMap: Map<string, string>;
  promptMap: Map<string, string>;
  flowMap: Map<string, string>;
}

/**
 * Check if a chain of nodes starting at `startNodeId` is exclusively
 * reachable from `sourceNodeId` (no other node points into the chain).
 * Returns the sequential chain of node IDs if exclusive.
 */
function isExclusiveChain(
  startNodeId: string,
  sourceNodeId: string,
  graphCtx: DecompileGraphCtx,
): { exclusive: boolean; chain: string[] } {
  const { incomingEdges, outgoingEdges, triggerNodeIds } = graphCtx;

  const chain: string[] = [];
  let current = startNodeId;
  let prevId = sourceNodeId;

  while (true) {
    if (triggerNodeIds.has(current)) break;

    // Each node must have exactly one incoming edge from the expected predecessor
    const incoming = incomingEdges.get(current) || [];
    if (incoming.length !== 1 || incoming[0] !== prevId) {
      return { exclusive: false, chain: [] };
    }

    chain.push(current);

    // Stop at terminal nodes or fan-out (switch/branch nodes)
    const outgoing = outgoingEdges.get(current) || [];
    if (outgoing.length !== 1) break;

    const nextId = outgoing[0];
    if (chain.includes(nextId)) break;
    if (triggerNodeIds.has(nextId)) break;

    prevId = current;
    current = nextId;
  }

  return { exclusive: chain.length > 0, chain };
}

/**
 * Decompile a chain of node IDs into DSL steps, marking them as inlined.
 */
function decompileChain(
  chain: string[],
  graphCtx: DecompileGraphCtx,
): DSLStepNode[] {
  return chain.map(nodeId => {
    graphCtx.inlinedNodeIds.add(nodeId);
    const node = graphCtx.nodes.find(n => n.id === nodeId)!;
    return decompileStepNode(node, graphCtx);
  });
}

/*─────────────────────────────────────────────────────────────────
 * Step Node Decompilation
 *─────────────────────────────────────────────────────────────────*/

/** Map BinaryOperator enum values back to DSL symbols */
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

function decompileStepNode(
  node: NodeEntity,
  graphCtx: DecompileGraphCtx,
): DSLStepNode {
  const { actionMap, promptMap, flowMap } = graphCtx;

  switch (node.nodeType) {
    case 'action': {
      const actionNode = node as ActionNode;
      const actionLabel = actionNode.actionId
        ? actionMap.get(actionNode.actionId) || actionNode.actionId
        : node.label || 'Unknown Action';

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
        : llmNode.prompt || node.label || 'Unknown Prompt';

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

      // Find outgoing edges from this switch node (for inline branch detection)
      const switchEdges = graphCtx.edges.filter(e => e.source === node.id);

      // Filter out incomplete conditions (empty predicate key = unfilled UI defaults)
      const validConditions = (Array.isArray(switchNode.conditions) ? switchNode.conditions : []).filter(c => {
        if (!c.predicate || typeof c.predicate === 'function') return !!c.predicate;
        return c.predicate.key && c.predicate.key.trim() !== '';
      });

      // Track which edge targets are matched by valid conditions
      const matchedTargets = new Set<string>();

      const dsl: DSLSwitchNode = {
        type: 'switch',
        conditions: validConditions.map((c) => {
          // Use original index for sourceHandle matching
          const ci = switchNode.conditions.indexOf(c);

          let ifExpr = '';
          if (c.predicate && typeof c.predicate !== 'function') {
            const opSymbol = operatorToDsl[c.predicate.operator] || c.predicate.operator;
            if (c.predicate.operator === 'is_empty' || c.predicate.operator === 'is_null') {
              ifExpr = `${c.predicate.key} ${opSymbol}`;
            } else {
              ifExpr = `${c.predicate.key} ${opSymbol} ${c.predicate.value ?? ''}`;
            }
          } else if (typeof c.predicate === 'function') {
            ifExpr = '[custom function]';
          }

          // Try to collapse exclusive branch chain into inline steps
          const branchEdge = switchEdges.find(
            e => (e.info as any)?.sourceHandle === `branch-${ci}`
          );

          if (branchEdge) {
            matchedTargets.add(branchEdge.target);
            const { exclusive, chain } = isExclusiveChain(
              branchEdge.target, node.id as string, graphCtx
            );
            if (exclusive && chain.length > 0) {
              return { if: ifExpr, steps: decompileChain(chain, graphCtx) };
            }
            // Non-exclusive: inline just the direct target
            const targetNode = graphCtx.nodes.find(n => n.id === branchEdge.target);
            if (targetNode) {
              graphCtx.inlinedNodeIds.add(targetNode.id as string);
              return { if: ifExpr, steps: [decompileStepNode(targetNode, graphCtx)] };
            }
          }

          // No edge: empty steps
          return { if: ifExpr, steps: [] };
        }),
      };

      // Add optional base fields
      if (node.label) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
      if (node.final) dsl.final = true;

      // Handle else branch
      // 1. Try explicit else handle first (for DSL-compiled flows)
      let elseEdge = switchEdges.find(
        e => (e.info as any)?.sourceHandle === `branch-${switchNode.conditions.length}`
      );
      // 2. Fallback: any unmatched switch edge (for UI-created flows where
      //    "else" is just a condition with empty predicate that got filtered out)
      if (!elseEdge) {
        elseEdge = switchEdges.find(e => !matchedTargets.has(e.target));
      }

      if (elseEdge) {
        const { exclusive, chain } = isExclusiveChain(
          elseEdge.target, node.id as string, graphCtx
        );
        if (exclusive && chain.length > 0) {
          dsl.else = decompileChain(chain, graphCtx);
        } else {
          const targetNode = graphCtx.nodes.find(n => n.id === elseEdge.target);
          if (targetNode) {
            graphCtx.inlinedNodeIds.add(targetNode.id as string);
            dsl.else = [decompileStepNode(targetNode, graphCtx)];
          }
        }
      }

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

    case 'kill': {
      const dsl: DSLKillNode = { type: 'kill' };
      if (node.label) dsl.label = node.label;
      if (node.description) dsl.description = node.description;
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

function buildTracksFromGraph(
  nodes: NodeEntity[],
  edges: EdgeEntity[],
  actionMap: Map<string, string>,
  promptMap: Map<string, string>,
  flowMap: Map<string, string>
): Track[] {
  // Find all trigger nodes (listeners and schedules)
  const listenerNodes = nodes.filter(n => n.nodeType === 'listener') as ListenerNode[];
  const scheduleNodes = nodes.filter(n => n.nodeType === 'schedule') as ScheduleNode[];

  // Build edge maps once for use in chain detection and step collection
  const incomingEdges = new Map<string, string[]>();
  const outgoingEdges = new Map<string, string[]>();
  for (const edge of edges) {
    const sources = incomingEdges.get(edge.target) || [];
    sources.push(edge.source);
    incomingEdges.set(edge.target, sources);

    const targets = outgoingEdges.get(edge.source) || [];
    targets.push(edge.target);
    outgoingEdges.set(edge.source, targets);
  }

  const triggerNodeIds = new Set([
    ...listenerNodes.map(n => n.id as string),
    ...scheduleNodes.map(n => n.id as string),
  ]);

  // Graph context for inline branch detection during decompilation
  const graphCtx: DecompileGraphCtx = {
    nodes,
    edges,
    triggerNodeIds,
    inlinedNodeIds: new Set(),
    incomingEdges,
    outgoingEdges,
    actionMap,
    promptMap,
    flowMap,
  };

  // Build tracks by following edges from each trigger node
  const tracks: Track[] = [];

  // Track used labels to ensure uniqueness
  const usedLabels = new Set<string>();

  /** Build exit chains from a trigger node's outgoing edges */
  function buildExits(triggerNodeId: string): DSLStepNode[][] {
    const triggerEdges = edges.filter(e => e.source === triggerNodeId);

    // Sort edges by exit index for deterministic ordering
    const sortedExitEdges = [...triggerEdges].sort((a, b) => {
      const aIdx = parseInt(((a.info as any)?.sourceHandle || 'exit-0').replace('exit-', ''));
      const bIdx = parseInt(((b.info as any)?.sourceHandle || 'exit-0').replace('exit-', ''));
      return aIdx - bIdx;
    });

    const exits: DSLStepNode[][] = [];
    for (const exitEdge of sortedExitEdges) {
      const chainSteps: NodeEntity[] = [];
      const visited = new Set<string>();
      function followChain(nodeId: string) {
        if (visited.has(nodeId) || triggerNodeIds.has(nodeId)) return;
        visited.add(nodeId);
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        chainSteps.push(node);
        const targets = outgoingEdges.get(nodeId) || [];
        for (const t of targets) followChain(t);
      }
      followChain(exitEdge.target as string);

      const pairs = chainSteps.map(step => ({
        nodeId: step.id as string,
        dsl: decompileStepNode(step, graphCtx),
      }));
      const dslSteps = pairs
        .filter(p => !graphCtx.inlinedNodeIds.has(p.nodeId))
        .map(p => p.dsl);
      exits.push(dslSteps);
    }

    if (exits.length === 0) exits.push([]);
    return exits;
  }

  /** Ensure label uniqueness by appending suffix if needed */
  function uniqueLabel(label: string): string {
    let unique = label;
    let counter = 2;
    while (usedLabels.has(unique)) {
      unique = `${label} ${counter}`;
      counter++;
    }
    usedLabels.add(unique);
    return unique;
  }

  const triggerNodes = nodes.filter(
    (node): node is ListenerNode | ScheduleNode =>
      node.nodeType === 'listener' || node.nodeType === 'schedule'
  );

  for (const triggerNode of triggerNodes) {
    if (triggerNode.nodeType === 'listener') {
      const track: Track = {
        event: triggerNode.eventType || triggerNode.label || 'unknown',
        exits: buildExits(triggerNode.id as string),
      };

      track.label = uniqueLabel(triggerNode.label || triggerNode.eventType);

      if (triggerNode.description) {
        track.description = triggerNode.description;
      }

      tracks.push(track);
      continue;
    }

    const track: Track = {
      schedule: triggerNode.cronExpression,
      exits: buildExits(triggerNode.id as string),
    };

    track.label = uniqueLabel(triggerNode.label || `Schedule`);

    if (triggerNode.description) {
      track.description = triggerNode.description;
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

export function exportFlowsDSL(outputDir: string, versioned = true): { filePath: string; flowCount: number } {
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

  // Find root flow ID
  const rootFlowId = qx().withRole(FLOW_ROLES.ROOT_FLOW).first();

  // Decompile each flow to track-based DSL
  const dsl: FlowDSL = {};
  let exported = 0;

  for (const flow of flows) {
    const { name, tracks } = decompileFlow(flow, actionMap, promptMap, flowMap);

    // Skip empty flows (no tracks)
    if (tracks.length === 0) continue;

    if (flow.id === rootFlowId) {
      dsl[name] = { root: true, tracks };
    } else {
      dsl[name] = tracks;
    }
    exported++;
  }

  // Write output
  if (versioned) {
    outputDir = createExportDir(outputDir, 'flows');
  } else {
    ensureDirectoryExists(outputDir);
  }
  const filePath = writeExportJson(outputDir, 'exported-flows.json', dsl);

  return { filePath, flowCount: exported };
}
