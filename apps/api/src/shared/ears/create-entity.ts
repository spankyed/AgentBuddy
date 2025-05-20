// import { logInternal } from "../debug/Log";
import { randomId } from "../utils/random-id";
import type { EARS } from "./types";

export const createEntity = (t: EARS.Entity) =>
  `${t}-${randomId()}` as EARS.EntityId;