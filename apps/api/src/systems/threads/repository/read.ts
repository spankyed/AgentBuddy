import { qx } from "@/shared/ears/helpers/query";
import { EARS } from "@/shared/ears/types";
import { ThreadExtendedData, ThreadLinkRelation, ThreadRelations, ThreadTagItem } from "../types";
import { MessageEntity } from "@/types";

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

export const getLinkedThreads = (threadId: EARS.EntityId) =>
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
    linkedThreads: want("linkedThreads") ? getLinkedThreads(threadId) : [],
  };
}
