import { EARS } from '@/shared/ears/types';
import { qx } from '@/shared/ears/helpers/query';
import { getRootFlow, getFlowNodes, getFlowEdges } from './read';
import { FlowsStartupData, FlowEntity } from '../types';
import { availableModels } from '../config/available-models';
import { getAllPrompts } from '../../prompts/repository/read';
import { FLOW_QUERY_FIELDS, FLOW_ROLES } from './constants';

export default function flowsStartupData(): FlowsStartupData {
  const flows = qx(EARS.Entity.Flow)
    .orderBy('createdAt', 'desc')
    .pick(FLOW_QUERY_FIELDS.LIST) as Partial<FlowEntity>[];

  const rootFlow = qx(EARS.Entity.Flow)
    .withRole(FLOW_ROLES.ROOT_FLOW)
    .pickOne(FLOW_QUERY_FIELDS.LIST) as Partial<FlowEntity> | undefined;
    
  const flowId = rootFlow?.id ?? 'Flow-1';
  const nodes = getFlowNodes(flowId);
  const edges = getFlowEdges(flowId);

  const selectedFlow = qx(EARS.Entity.Flow)
    .withRole(FLOW_ROLES.ROOT_FLOW)
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