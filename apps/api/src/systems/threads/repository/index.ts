import { tx } from "@/shared/ears/helpers/transaction";
import { qx } from "@/shared/ears/helpers/query";
import { EARS } from "@/shared/ears/types";
import { MessageEntity, TagEntity, ThreadEntity } from "@/shared/types";
import { ThreadCreateData, ThreadExtendedData, ThreadLinkRelation, ThreadRelations, ThreadTagItem, ThreadTypeCodes, ThreadTypeShortCode } from "../types";
import { updateThreadField } from "./update";

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

export function updateTag(id: EARS.EntityId, props: Partial<TagEntity>) {
  const t = tx(id);
  if (props.name  !== undefined) t.merge("name",  props.name);
  if (props.color !== undefined) t.merge("color", props.color);
  t.merge("updatedAt", Date.now());
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
    tx(id).linkOne(EARS.RelKind.HAS, tag.id);
  }
  for (const rel of thread.relatedThreads ?? []) {
    tx(id).linkOne(EARS.RelKind.Custom(rel.relation), rel.id);
  }

  return { id, shortCode, timestamp: ts };
}


/*─────────────────────────────────────────────────────────────
 * Query helpers (use the new qx API)
 *─────────────────────────────────────────────────────────────*/
const msgCols    = ["text", "sender", "timestamp"]                 as const;
const tagCols    = ["name", "color"]                               as const;
const threadCols = ["shortCode", "topic", "threadType", "status"]  as const;

export const getThreadMessages = (threadId: EARS.EntityId) =>
  qx(threadId)
    .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Message)
    .rows(msgCols);

export const getThreadTags = (threadId: EARS.EntityId) =>
  qx(threadId)
    .linksTo(EARS.RelKind.HAS, EARS.Entity.Tag)
    .rows(tagCols);

export const getRelatedThread = (
  threadId: EARS.EntityId,
  relation: ThreadLinkRelation
) =>
  qx(threadId)
    .linkRows(
      EARS.RelKind.Custom(relation),
      EARS.Entity.Thread,
      threadCols
    );

export const getRelatedThreads = (threadId: EARS.EntityId) =>
  qx(threadId)
    .linkRows(
      ThreadRelations,
      EARS.Entity.Thread,
      threadCols
    );

/*─────────────────────────────────────────────────────────────
 * Extended data convenience
 *─────────────────────────────────────────────────────────────*/
type Include = keyof ThreadExtendedData;
export function getExtendedData(
  threadId: EARS.EntityId,
  include?: Include | Include[]
): ThreadExtendedData {
  const want = (k: Include) =>
    !include
      ? true
      : Array.isArray(include)
        ? include.includes(k)
        : include === k;

  return {
    messages: want("messages") ? getThreadMessages(threadId) as Partial<MessageEntity>[] : [],
    tags: want("tags") ? getThreadTags(threadId) as ThreadTagItem[] : [],
    relatedThreads: want("relatedThreads") ? getRelatedThreads(threadId) : [],
  };
}

/* ----------------------------------------------------------------------- */
/* 1 ▸ helpers for relation juggling (legacy exports)                      */
/* ----------------------------------------------------------------------- */
export {
  updateThreadField
}