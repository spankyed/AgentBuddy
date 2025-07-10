import { tx } from "@/shared/ears/helpers/transaction";
import { qx } from "@/shared/ears/helpers/query";
import { EARS } from "@/shared/ears/types";
import type { NodeEntity, NodeCreateInput, NodeKind } from "../types";
import { extractNodeRelations, updateNodeRelations } from "./node-relations";
import { getTimestamp, filterSystemFields } from "@/shared/ears/helpers/entity-utils";
import { NodeNotFoundError } from "./errors";

export function updateFlowLabel(flowId: EARS.EntityId, label: string) {
  const ts = getTimestamp();
  
  tx(flowId)
    .merge("label", label)
    .merge("updatedAt", ts);
  
  return { success: true };
}

export function updateNode(nodeId: EARS.EntityId, updates: NodeCreateInput) {
  const ts = getTimestamp();
  
  // Get the current node to determine its type
  const currentNode = qx(nodeId).pickOne(['nodeType']) as { nodeType: NodeKind } | undefined;
  if (!currentNode) {
    throw new NodeNotFoundError(nodeId);
  }
  
  // Extract relations and attributes based on node type
  const { relations, attributes } = extractNodeRelations(currentNode.nodeType, updates);
  
  // Update node-specific relationships
  updateNodeRelations(currentNode.nodeType, nodeId, relations);
  
  // Filter out system fields and build updates
  const fieldsToUpdate = filterSystemFields(attributes);
  
  // Build the transaction for node attributes
  const transaction = tx(nodeId);
  
  // Update each field
  Object.entries(fieldsToUpdate).forEach(([key, value]) => {
    // For arrays, we need to replace the entire value, not merge
    if (Array.isArray(value)) {
      // First drop the old value, then put the new one
      // ! shouldn't need to do this, but EARS allows multiple attributes with the same key
      transaction.drop(EARS.AttrKind.Custom(key));
      transaction.put(key, value);
    } else {
      transaction.merge(key as any, value);
    }
  });
  
  // Always update the timestamp
  transaction.merge("updatedAt", ts);
  
  return { success: true };
}