import { EARS } from '@/shared/ears/types';
import { qx } from '@/shared/ears/helpers/query';
import { getRootFlow, getFlowNodes, getFlowEdges } from './read';
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
    
  const flowId = rootFlow?.id ?? 'Flow-1';
  const nodes = getFlowNodes(flowId);
  const edges = getFlowEdges(flowId);

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