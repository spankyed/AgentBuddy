import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';
import { entries } from '@/shared/utils';
import type { EdgeEntity, FlowExtendedData, NodeEntity } from '../types';
import { edgeKinds } from './index';
import { edgeStore } from '@/shared/ears/helpers/edge-store';

const sharedFields = ['id', 'nodeType', 'createdAt', 'label', 'x', 'y'] as const;
const nodeFields = {
  LLM: ['prompt'] as const,
  EVENT_LISTENER: [] as const,
  TRANSFORM: [] as const,
  RESPONSE: [] as const,
  ACTION: [] as const,
  VARIABLE: [] as const,
  FIRE_EVENT: [] as const,
  DECISION: [] as const,
}

const fields = [
  ...sharedFields,
  ...entries(nodeFields).map(([_, fields]) => fields).flat()
];

const ROOT_FLOW = EARS.RoleKind.Custom("root_flow");

export const getRootFlow = (): EARS.EntityId | undefined =>
  qx().withRole(ROOT_FLOW).first() ?? undefined;

export const getFlowNodes = (flowId: EARS.EntityId) =>
  qx(flowId)
    .linksPick(
      EARS.RelKind.CONTAINS,
      EARS.Entity.Node,
      fields
    );

export const getFlowEdges = (flowId: EARS.EntityId): EdgeEntity[] => {
  // Get all nodes in the flow
  const nodes = getFlowNodes(flowId);
  const nodeIds = nodes.map(n => n.id).filter(Boolean) as EARS.EntityId[];
  
  const seen = new Set<string>();
  const edges: EdgeEntity[] = [];

  for (const source of nodeIds) {
    qx(source)
      .links(edgeKinds, [EARS.Entity.Node])
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
    nodes: want("nodes") ? getFlowNodes(flowId) as Partial<NodeEntity>[] : [],
    edges: want("edges") ? getFlowEdges(flowId) : [],
  };
}
