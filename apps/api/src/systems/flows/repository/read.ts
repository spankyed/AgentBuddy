import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';
import type { EdgeEntity, FlowExtendedData, NodeEntity, NodeEntityEnriched } from '../types';
import { edgeStore } from '@/shared/ears/helpers/edge-store';
import { enrichNodeWithRelations } from './node-handlers';
import { FLOW_ROLES, FLOW_EDGE_KINDS } from './constants';

export const getRootFlow = (): EARS.EntityId | undefined =>
  qx().withRole(FLOW_ROLES.ROOT_FLOW).first() ?? undefined;

export const getNode = (nodeId: EARS.EntityId): NodeEntityEnriched | undefined => {
  // Use pickAll to get all attributes including fieldMappings
  const nodes = qx([nodeId]).pickAll() as unknown as NodeEntity[];
  const node = nodes[0];
  return node ? enrichNodeWithRelations(node) : undefined;
};

export const getFlowNodes = (flowId: EARS.EntityId): NodeEntityEnriched[] => {
  const nodeIds = qx(flowId)
    .links(EARS.RelKind.CONTAINS, EARS.Entity.Node)
    .map(({ id }) => id);
  
  const nodes = qx(nodeIds).pickAll() as unknown as NodeEntity[];
  
  // Enrich each node with its relational data
  return nodes.map(node => enrichNodeWithRelations(node));
};

export const getFlowEdges = (flowId: EARS.EntityId): EdgeEntity[] => {
  // Get all nodes in the flow
  const nodes = getFlowNodes(flowId);
  const nodeIds = nodes.map(n => n.id).filter(Boolean) as EARS.EntityId[];
  
  const seen = new Set<string>();
  const edges: EdgeEntity[] = [];

  for (const source of nodeIds) {
    qx(source)
      .links(FLOW_EDGE_KINDS, [EARS.Entity.Node])
      // Only include edges where target is also in this flow
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
};

/*─────────────────────────────────────────────────────────────
 * Extended data convenience
 *─────────────────────────────────────────────────────────────*/
type Include = keyof FlowExtendedData;

export function getExtendedData(
  flowId: EARS.EntityId,
  include?: Include | Include[]
): FlowExtendedData {
  const want = (k: Include) =>
    !include
      ? true
      : Array.isArray(include)
        ? include.includes(k)
        : include === k;

  return {
    nodes: want("nodes") ? getFlowNodes(flowId) : [],
    edges: want("edges") ? getFlowEdges(flowId) : [],
  };
}