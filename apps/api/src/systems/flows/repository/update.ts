import { tx } from "@/shared/ears/helpers/transaction";
import { EARS } from "@/shared/ears/types";

export function updateFlowLabel(flowId: EARS.EntityId, label: string) {
  const ts = Date.now();
  
  tx(flowId)
    .merge("label", label)
    .merge("updatedAt", ts);
  
  return { success: true };
} 