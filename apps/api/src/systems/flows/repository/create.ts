import { tx } from "@/shared/ears/helpers/transaction";
import { qx } from "@/shared/ears/helpers/query";
import { EARS } from "@/shared/ears/types";
import type { FlowEntity, NodeEntity } from "../types";

export function createFlow(flow?: Partial<FlowEntity>): FlowEntity {
  const ts = Date.now();
  const count = qx(EARS.Entity.Flow).count() + 1;

  const newFlow: Omit<FlowEntity, 'id'> = {
    entityType: EARS.Entity.Flow,
    shortCode: `F-${count}`,
    label: `New Flow ${count}`,
    description: '',
    flowType: 'workflow',
    createdAt: ts,
    updatedAt: ts,
  };

  const id = tx(EARS.Entity.Flow)
    .batchPut(newFlow)
    .id();
  
  return { id, ...newFlow };
}

export function createFlowWithEntryNode(flow?: Partial<FlowEntity>): { flow: FlowEntity; entryNode: NodeEntity } {
  // Create the flow
  const newFlow = createFlow(flow);
  
  // Create the entry node
  const entryNode = createNode(newFlow.id, {
    nodeType: 'listen',
    label: 'Flow Entry',
    color: '#1E88E5', // blue
    mode: 'entry',
    eventType: 'flow.entry',
  } as Partial<NodeEntity>);
  
  // Establish entry node role
  tx(entryNode.id).grant('entry_event').id();
  
  // Create EVENT_TRACE relationship from flow to entry node
  tx(newFlow.id).link(EARS.RelKind.EVENT_TRACE, entryNode.id);
  
  return { flow: newFlow, entryNode };
}

export function createNode(flowId: EARS.EntityId, nodeData: Partial<NodeEntity>): NodeEntity {
  const ts = Date.now();
  
  // Ensure the node has the required fields
  const newNode: Omit<NodeEntity, 'id'> = {
    entityType: EARS.Entity.Node,
    nodeType: nodeData.nodeType || 'action',
    label: nodeData.label || 'New Node',
    description: nodeData.description || '',
    createdAt: ts,
    updatedAt: ts,
    ...nodeData,
  } as Omit<NodeEntity, 'id'>;

  // Create the node
  const nodeId = tx(EARS.Entity.Node)
    .batchPut(newNode)
    .id();
  
  // Establish relationship from flow to node
  tx(flowId).link(EARS.RelKind.CONTAINS, nodeId);
  
  return { id: nodeId, ...newNode } as NodeEntity;
}

export function createEdge(sourceId: EARS.EntityId, targetId: EARS.EntityId): void {
  // In EARS, edges are relationships, not entities
  // We just create the relationship between the nodes
  tx(sourceId).link(EARS.RelKind.TRANSITIONS_TO, targetId);
}
