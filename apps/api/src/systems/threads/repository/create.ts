import { tx } from "@/shared/ears/helpers/transaction";
import { qx } from "@/shared/ears/helpers/query";
import { EARS } from "@/shared/ears/types";
import { ThreadCreateData, ThreadTypeCodes, ThreadTypeShortCode } from "../types";
import { ThreadEntity } from "@/types";

/*─────────────────────────────────────────────────────────────
 * Mutation helpers (use the new tx API)
 *─────────────────────────────────────────────────────────────*/
export function createTag(name: string) {
  return tx(EARS.Entity.Tag)
    .put("name",      name)
    .put("createdAt", Date.now())
    .put("updatedAt", Date.now())
    .id();
}

export function createThread(thread: ThreadCreateData) {
  const ts    = Date.now();
  const count = qx(EARS.Entity.Thread).count();
  const code: Record<ThreadEntity["threadType"], ThreadTypeCodes> = {
    "work-item": "WI",
    "project":   "P",
    "user":      "U",
  };
  const shortCode = `${code[thread.threadType]}-${count}` as ThreadTypeShortCode;

  const id = tx(EARS.Entity.Thread)
    .put("status",       "draft")
    .put("shortCode",    shortCode)
    .put("timestamp",    ts)
    .put("createdAt",    ts)
    .put("updatedAt",    ts)
    .put("topic",        thread.topic)
    .put("instructions", thread.instructions)
    .put("threadType",   thread.threadType)
    .id();

  for (const tag of thread.tags ?? []) {
    tx(id).link(EARS.RelKind.HAS, tag.id);
  }
  for (const rel of thread.relatedThreads ?? []) {
    tx(id).link(EARS.RelKind.Custom(rel.relation), rel.id);
  }

  return { id, shortCode, timestamp: ts };
}
