/* ----------------------------------------------------------------------- */
/* 1 ▸ helpers for relation juggling                                       */

import { tx } from "@/shared/ears";
import { EARS } from "@/shared/ears/types";
import { ThreadTagItem, ThreadLinkItem, ThreadEditFields } from "../types";
import { getRelatedThreads, getThreadTags } from "./index";
import { ThreadEntity } from "@/shared/types";


/* ----------------------------------------------------------------------- */
/* 1 ▸ concrete handlers                                                   */
/* ----------------------------------------------------------------------- */
function handleTags(threadId: EARS.EntityId, tags: ThreadTagItem[]) {
  // Remove all existing tag relations
  const existingTags = getThreadTags(threadId);
  for (const tag of existingTags) {
    tx(threadId).delRel(tag.id);
  }

  // Add new tag relations
  const newTags = tags;
  for (const tag of newTags) {
    tx(threadId).rel(EARS.RelKind.HAS, tag.id);
  }
  // ! somethings wrong, tags not being removed properly
}

function handleRelatedThreads(
  threadId: EARS.EntityId,
  links: ThreadLinkItem[]
) {
  // Remove all existing thread relations
  const existingThreads = getRelatedThreads(threadId);
  for (const { thread, relation } of existingThreads) {
    tx(threadId).delRel(thread.id);
  }
  // Add new thread relations
  // ! need to confirm we send all relations
  const newThreads = links;
  for (const { thread, relation } of newThreads) {
    tx(threadId).rel(EARS.RelKind.Custom(relation), thread.id);
  }
}

/* ----------------------------------------------------------------------- */
/* 2 ▸ single source‑of‑truth map (type‑safe at declaration)               */
/* ----------------------------------------------------------------------- */
const relationHandlers = {
  tags: handleTags,
  relatedThreads: handleRelatedThreads,
} as const; //  <-- “as const” preserves the literal keys

type RelationKey = keyof typeof relationHandlers;

/* ----------------------------------------------------------------------- */
/* 3 ▸ public API                                                          */
/* ----------------------------------------------------------------------- */
export function updateThreadField<
  K extends keyof ThreadEditFields
>(
  threadId: EARS.EntityId,
  key: K,
  value: K extends RelationKey
    ? Parameters<(typeof relationHandlers)[K]>[1]  // ← derive from handler
    : ThreadEditFields[K]                          // ← plain scalar/enum/etc.
): void {
  if ((key as string) in relationHandlers) {
    // same key typed two ways, so cast the lookup to make TS happy
    (relationHandlers as Record<string, any>)[key](threadId, value);
  } else {
    tx(threadId).update(key as keyof ThreadEntity, value as ThreadEntity[keyof ThreadEntity]);
  }
}