import { tx } from "@/shared/ears/helpers/transaction";
import { qx } from "@/shared/ears/helpers/query";
import { EARS } from "@/shared/ears/types";
import type { NodeEntity, NodeCreateInput, NodeKind } from "../types";
import { extractNodeRelations, updateNodeRelations } from "./node-handlers";

export function updateFlowLabel(flowId: EARS.EntityId, label: string) {
  const ts = Date.now();
  
  tx(flowId)
    .merge("label", label)
    .merge("updatedAt", ts);
  
  return { success: true };
}

export function updateNode(nodeId: EARS.EntityId, updates: NodeCreateInput) {
  const ts = Date.now();
  
  // Get the current node to determine its type
  const currentNode = qx(nodeId).pickOne(['nodeType']) as { nodeType: NodeKind } | undefined;
  if (!currentNode) {
    throw new Error(`Node ${nodeId} not found`);
  }
  
  // Extract relations and attributes based on node type
  const { relations, attributes } = extractNodeRelations(currentNode.nodeType, updates);
  
  // Update node-specific relationships
  updateNodeRelations(currentNode.nodeType, nodeId, relations);
  
  // Build the transaction for node attributes
  const transaction = tx(nodeId);
  
  // Update each field that was provided
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && key !== 'id' && key !== 'entityType') {
      transaction.merge(key as any, value);
    }
  });
  
  // Always update the timestamp
  transaction.merge("updatedAt", ts);
  
  return { success: true };
} 