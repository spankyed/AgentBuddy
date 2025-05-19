// import { logInternal } from "../debug/Log";
import type { ECS } from "./types";

const id_counters: Record<ECS.Entity, number> = {} as any; // todo use uuid and/or persistent storage

const createEntity = (type: ECS.Entity, skipLog?: boolean): ECS.EntityId => {
  id_counters[type] = (id_counters[type] || 0) + 1;

  const newEntity = `${type}-${id_counters[type]}` as ECS.EntityId;

  // logInternal('EC', skipLog, newEntity);

  return newEntity;
};

export {
  createEntity
};
