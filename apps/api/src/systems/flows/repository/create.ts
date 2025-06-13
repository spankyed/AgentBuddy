import { tx } from "@/shared/ears/helpers/transaction";
import { qx } from "@/shared/ears/helpers/query";
import { EARS } from "@/shared/ears/types";
import type { FlowEntity } from "../types";

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
