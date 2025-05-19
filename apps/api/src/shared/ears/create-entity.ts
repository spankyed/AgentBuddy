// import { logInternal } from "../debug/Log";
import type { EARS } from "./types";

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const id_counters: Record<EARS.Entity, number> = {} as any; // todo use uuid and/or persistent storage

const createEntity = (type: EARS.Entity, skipLog?: boolean): EARS.EntityId => {
  id_counters[type] = (id_counters[type] || 0) + 1;

  const newEntity = `${type}-${id_counters[type]}` as EARS.EntityId;

  // logInternal('EC', skipLog, newEntity);

  return newEntity;
};

export {
  createEntity
};
