import { tx } from "@/shared/ears/helpers/transaction";
import { EARS } from "@/shared/ears/types";
import { ThreadTagItem, ThreadLinkItem, ThreadEditFields, ThreadRelations } from "../types";

/** ── Relation handlers ─────────────────────────────────────────────── */
const handleTags = (threadId: EARS.EntityId, tags: ThreadTagItem[]) => {
  // nuke all existing HAS edges
  tx(threadId).unlinkIf(EARS.RelKind.HAS);
  // add exactly the new set
  for (const { id: tagId } of tags) {
    tx(threadId).linkOne(EARS.RelKind.HAS, tagId);
  }
};

const handleRelatedThreads = (threadId: EARS.EntityId, links: ThreadLinkItem[]) => {
  // nuke all outgoing edges for every supported relation kind
  for (const rel of ThreadRelations) {
    tx(threadId).unlinkIf(EARS.RelKind.Custom(rel));
  }
  // add the new ones
  for (const { id, relation } of links) {
    tx(threadId).linkOne(EARS.RelKind.Custom(relation), id);
  }
};

const relationHandlers = {
  tags:           handleTags,
  relatedThreads: handleRelatedThreads,
} as const;

type RelationKey = keyof typeof relationHandlers;

/** ── Public update function ───────────────────────────────────────── */
export function updateThreadField<K extends keyof ThreadEditFields>(
  threadId: EARS.EntityId,
  key: K,
  value: K extends RelationKey
  ? Parameters<(typeof relationHandlers)[K]>[1]
  : ThreadEditFields[K],
): void {
  if (key in relationHandlers) {
    // @ts-expect-error safe dispatch
    relationHandlers[key](threadId, value);
  } else {
    // scalar/enum/etc → simple attr update
    tx(threadId).merge(key as string, value as any);
  }
}