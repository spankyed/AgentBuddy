import { tx } from "@/shared/ears/helpers/transaction";
import { EARS } from "@/shared/ears/types";
import type { NodeEntity } from "../types";

export function updateFlowLabel(flowId: EARS.EntityId, label: string) {
  const ts = Date.now();
  
  tx(flowId)
    .merge("label", label)
    .merge("updatedAt", ts);
  
  return { success: true };
}

export function updateNode(nodeId: EARS.EntityId, updates: Partial<NodeEntity>) {
  const ts = Date.now();
  
  // Build the transaction
  const transaction = tx(nodeId);
  
  // Update each field that was provided
  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined && key !== 'id' && key !== 'entityType') {
      transaction.merge(key as any, value);
    }
  });
  
  // Always update the timestamp
  transaction.merge("updatedAt", ts);
  
  return { success: true };
} 