import { EARS } from '@/shared/ears/types';
import { qx } from '@/shared/ears/helpers/query';
import { getRootFlow } from './read';
import { FlowsStartupData, EdgeEntity, NodeEntity, FlowEntity } from '../types';
import { edgeStore } from '@/shared/ears/helpers/edge-store';
import { edgeKinds } from '.';
import { availableModels } from '../config/available-models';
import { getAllPrompts } from '../../prompts/repository/read';


export default function flowsStartupData(): FlowsStartupData {
  const flowCols = ["id", "label", "flowType", "status", "createdAt"] as const;

  const flows = qx(EARS.Entity.Flow)
    .orderBy('createdAt', 'desc')
    .pick(flowCols) as Partial<FlowEntity>[];

  const rootFlow = qx(EARS.Entity.Flow)
    .withRole(EARS.RoleKind.Custom("root_flow"))
    .pickOne(flowCols) as Partial<FlowEntity> | undefined;
    
  const nodeIdsList = qx(rootFlow?.id ?? 'Flow-1')
    .links(EARS.RelKind.CONTAINS, EARS.Entity.Node)
    .map(({ id }) => id);
  
  const nodes = qx(nodeIdsList).pickAll() as Partial<NodeEntity>[];

  const nodeIds = nodes.map(n => n.id!).filter(Boolean);

  const seen = new Set<string>();
  const edges: EdgeEntity[] = [];

  for (const source of nodeIds) {
    qx(source)
      .links(edgeKinds, [EARS.Entity.Node])
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

  const selectedFlow = qx(EARS.Entity.Flow)
    .withRole(EARS.RoleKind.Custom("root_flow"))
    .pickOne(["id"]) as { id: EARS.EntityId };

  return {
    graph: {
      nodes,
      edges,
    },
    flows,
    rootFlow,
    selectedFlowId: selectedFlow.id,
    models: availableModels,
    prompts: getAllPrompts(),
  };
}