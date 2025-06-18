import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';
import type { FlowTNodeData, TNodeEntity, TrackEntity, EventListenerEntity } from '../types';
import type { FlowEntity, NodeEntity, ListenNode } from '@/systems/flows/types';
import { descendants } from '@/shared/ears/helpers/graph';

function buildTNodeTree(tNodeId: EARS.EntityId): TrackEntity {
  const nodeCols = ["id", "nodeType", "label", "status", "startedAt", "createdAt", "eventTag", "stepNodeId", "stepNodeType"] as const;
  
  // Get the flow TNode
  const flowTNode = qx(tNodeId)
    .pickOne(nodeCols) as TNodeEntity;
  
  if (!flowTNode || flowTNode.nodeType !== 'flow') {
    throw new Error(`Invalid flow TNode: ${tNodeId}`);
  }
  
  // Get all event TNodes tracked by this flow
  const eventTNodes = qx(tNodeId)
    .linksPick(EARS.RelKind.TRACKED, nodeCols, [EARS.Entity.TNode]) as TNodeEntity[];
  
  // For each event, get all its spawned descendants (full chain)
  const eventTNodesWithChildren = eventTNodes.map(eventTNode => {
    // Get all descendant IDs using the graph helper
    const descendantIds = descendants(eventTNode.id!, EARS.RelKind.SPAWNED);
    
    // Query for full details of all descendants
    const descendantTNodes = qx(descendantIds)
      .pick(nodeCols) as TNodeEntity[];
    
    return {
      ...eventTNode,
      children: descendantTNodes.map(child => ({ ...child, children: [] }))
    };
  });
  
  return {
    ...flowTNode,
    children: eventTNodesWithChildren
  };
}

export default function getStartupData(): FlowTNodeData {
  const rootFlowTNode = qx(EARS.Entity.TNode)
    .withRole(EARS.RoleKind.Custom("root_trace_node"))
    .first();
  
  if (!rootFlowTNode) {
    throw new Error("No root flow TNode found");
  }
  return getExtendedTNodeData(rootFlowTNode);
}

export function getExtendedTNodeData(tNodeId: EARS.EntityId): FlowTNodeData {
  // const flowCols = ["id", "label", "flowType", "status", "createdAt"] as const;
  
  // Get the TNode and ensure it's a flow node
  const tNode = qx(tNodeId)
    .pickOne(["nodeType"]) as Pick<TNodeEntity, 'nodeType'> | null;
  
  if (!tNode || tNode.nodeType !== 'flow') {
    throw new Error(`Invalid flow TNode: ${tNodeId}`);
  }
  
  // Get the flow blueprint this TNode is an instance of through INSTANCE_OF relation
  const flowLinks = qx(tNodeId)
    .links(EARS.RelKind.Custom('INSTANCE_OF'), [EARS.Entity.Flow]);
  
  if (flowLinks.length === 0) {
    throw new Error(`Flow TNode ${tNodeId} has no INSTANCE_OF relation to a flow blueprint`);
  }

  
  const flowId = flowLinks[0].id;
  
  // Get the flow
  // const flow = qx(flowId)
  //   .pickOne(flowCols) as Partial<FlowEntity>;
  
  // Get all listener nodes in the flow blueprint
  const listenerNodes = qx(flowId)
    .linksPick(
      EARS.RelKind.CONTAINS,
      [
        'id',
        'label',
        'nodeType',
        'eventTag',
        'mode',
      ] as const,
      [EARS.Entity.Node]
    )
    .filter((node: any) => node.nodeType === 'listen') as ListenNode[];
  
  // Convert to EventListenerEntity format
  const possibleEvents: EventListenerEntity[] = listenerNodes.map(node => ({
    id: `Event-${node.id}` as EARS.EntityId,
    nodeId: node.id!,
    eventTag: node.eventTag,
    label: node.label,
    mode: node.mode
  }));
  
  // Build the TNode tree starting from the current flow TNode
  const tNodeTree = buildTNodeTree(tNodeId);
  console.log('tNodeTree: ', tNodeTree);
  
  return {
    flowTNodeId: tNodeId,
    tNodeTree,
    possibleEvents,
  };
} 