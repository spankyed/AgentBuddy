/**
 * Reusable DSL Export Function
 *
 * Converts EARS flows to the track-based DSL format.
 * Safe to import from the running server (no CLI side effects).
 */

import { createExportDir, ensureDirectoryExists } from '@abuddy/sdk/utils';
import { writeExportJson } from '@abuddy/sdk/utils';
import { qx } from '@abuddy/sdk/ears';
import { edgeStore } from '@abuddy/sdk/ears';
import { EARS } from '@/registries/ears';
import { FLOW_ROLES } from '../repository/index';
import { stepRegistry } from '@abuddy/sdk/steps';
import type {
  FlowDSL,
  Track,
  DSLStepNode,
} from './types';
import type {
  NodeEntity,
  EdgeEntity,
  FlowEntity,
  ListenerNode,
} from '../config/types';
import type { ActionEntity } from '@/plugins/actions/be/types';
import type { PromptEntity } from '@/plugins/prompts/be/types';

// Edge kinds for flow transitions
const FLOW_EDGE_KINDS = [EARS.RelKind.TRANSITIONS_TO] as const;

/*─────────────────────────────────────────────────────────────────
 * Database Queries (avoiding circular imports)
 *─────────────────────────────────────────────────────────────────*/

function getFlowNodes(flowId: EARS.EntityId): NodeEntity[] {
  const nodeIds = qx(flowId)
    .links(EARS.RelKind.CONTAINS, EARS.Entity.Node)
    .map(({ id }) => id);

  const nodes = qx(nodeIds).pickAll() as unknown as NodeEntity[];

  // Hydrate entity relationships from registry-defined relation configs
  return nodes.map(node => {
    const rel = stepRegistry.getBuild(node.nodeType)?.relation;
    if (!rel) return node;
    const linkedId = qx(node.id)
      .links(EARS.RelKind.INSTANCE_OF)
      .map(({ id }) => id)[0];
    return linkedId ? { ...node, [rel.field]: linkedId } : node;
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

function resolveBranch(
  sourceNodeId: string,
  sourceHandle: string,
  graphCtx: DecompileGraphCtx,
): DSLStepNode[] | null {
  const sourceEdges = graphCtx.edges.filter(e => e.source === sourceNodeId);

  // Find edge matching the handle
  let branchEdge = sourceEdges.find(
    e => (e.info as any)?.sourceHandle === sourceHandle
  );
  // Fallback for else branches: any unmatched edge from this source
  if (!branchEdge) {
    const matchedTargets = new Set(
      sourceEdges
        .filter(e => (e.info as any)?.sourceHandle)
        .map(e => e.target)
    );
    branchEdge = sourceEdges.find(e => !matchedTargets.has(e.target));
  }

  if (!branchEdge) return null;

  const { exclusive, chain } = isExclusiveChain(
    branchEdge.target, sourceNodeId, graphCtx
  );
  if (exclusive && chain.length > 0) {
    return decompileChain(chain, graphCtx);
  }
  // Non-exclusive: inline just the direct target
  const targetNode = graphCtx.nodes.find(n => n.id === branchEdge!.target);
  if (targetNode) {
    graphCtx.inlinedNodeIds.add(targetNode.id as string);
    return [decompileStepNode(targetNode, graphCtx)];
  }
  return null;
}

function decompileStepNode(
  node: NodeEntity,
  graphCtx: DecompileGraphCtx,
): DSLStepNode {
  const build = stepRegistry.getBuild(node.nodeType);
  if (build?.decompile) {
    return build.decompile(node as any, {
      actionMap: graphCtx.actionMap,
      promptMap: graphCtx.promptMap,
      flowMap: graphCtx.flowMap,
      resolveBranch: (sourceId, handle) =>
        resolveBranch(sourceId, handle, graphCtx) as Record<string, unknown>[] | null,
    }) as DSLStepNode;
  }
  console.warn(`No decompile for node type: ${node.nodeType}`);
  return { type: node.nodeType, label: node.label } as any;
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
  // Find all trigger nodes (listeners + registered triggers like schedule)
  const listenerNodes = nodes.filter(n => n.nodeType === 'listener') as ListenerNode[];
  const registeredTriggerNodes = nodes.filter(n => stepRegistry.isTrigger(n.nodeType));

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
    ...registeredTriggerNodes.map(n => n.id as string),
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

  const allTriggerNodes = [
    ...listenerNodes,
    ...registeredTriggerNodes,
  ];

  for (const triggerNode of allTriggerNodes) {
    if (triggerNode.nodeType === 'listener') {
      const listenerNode = triggerNode as ListenerNode;
      const track: Track = {
        event: listenerNode.eventType || listenerNode.label || 'unknown',
        exits: buildExits(triggerNode.id as string),
      };

      track.label = uniqueLabel(listenerNode.label || listenerNode.eventType);

      if (listenerNode.description) {
        track.description = listenerNode.description;
      }

      tracks.push(track);
      continue;
    }

    const triggerFacet = stepRegistry.getTrigger(triggerNode.nodeType);
    if (triggerFacet?.decompile) {
      const trackFields = triggerFacet.decompile(triggerNode as unknown as Record<string, unknown>);
      const track: Track = {
        ...trackFields,
        exits: buildExits(triggerNode.id as string),
      } as Track;

      track.label = uniqueLabel(triggerNode.label || triggerNode.nodeType);

      if (triggerNode.description) {
        track.description = triggerNode.description;
      }

      tracks.push(track);
    }
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
