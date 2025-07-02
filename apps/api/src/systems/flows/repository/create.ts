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
