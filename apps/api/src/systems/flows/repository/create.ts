import { tx } from "@/shared/ears/helpers/transaction";
import { qx } from "@/shared/ears/helpers/query";
import { EARS } from "@/shared/ears/types";
import type { FlowEntity } from "../types";

export function createFlow(flow?: Partial<FlowEntity>) {
  const ts = Date.now();
  const count = qx(EARS.Entity.Flow).count() + 1;

  const id = tx(EARS.Entity.Flow)
    .put("shortCode", `F-${count}`)
    .put("createdAt", ts)
    .put("updatedAt", ts)
    .id();

  return { id, timestamp: ts, flowNumber: count };
} 