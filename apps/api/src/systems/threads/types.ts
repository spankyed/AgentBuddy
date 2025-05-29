import type { EARS, MessageEntity, TagEntity, ThreadEntity } from "@/types";
import { timestamp } from 'drizzle-orm/gel-core';

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type OmitExcessFields<T> = Omit<T, 'createdAt' | 'updatedAt' | 'entityType'>;

export type ThreadTypeCodes = 'U' | 'P' | 'WI';
export type ThreadTypeShortCode = `${ThreadTypeCodes}-${number}`;

export const ThreadStatuses = ['draft', 'queued', 'active', 'inactive'] as const;
export const ThreadRelations = ['parent_of', 'blocks', 'blocked_by', 'duplicates'] as const;

export type ThreadStatus = typeof ThreadStatuses[number];
export type ThreadLinkRelation = typeof ThreadRelations[number];
export type ThreadLinkInput = { id: EARS.EntityId; relation: ThreadLinkRelation };
export type ThreadLink = Pick<ThreadEntity, 'id' | 'shortCode' | 'status' | 'timestamp' | 'topic' | 'threadType'>;

export type ThreadLinkItem = { thread: ThreadLink; relation: ThreadLinkRelation };
export type ThreadTagItem = OmitExcessFields<TagEntity>

export type ThreadExtended = Simplify<ThreadEntity & ThreadRelatedData>;
export type ThreadRelatedData = {
  messages?: Partial<MessageEntity>[];
  relatedThreads?: ThreadLinkItem[];
  tags?: Partial<TagEntity>[];
}

export type ThreadStartupData = {
  threads: ThreadExtended[];
  availableTags: TagEntity[];
}

export type ThreadEditFields = Pick<ThreadEntity, 'topic' | 'threadType' | 'instructions'>;
export type ThreadListFields = {
  tagsInput?: ThreadTagItem[];
  relatedThreadsInput?: ThreadLinkItem[];
}

export type ThreadCreateData = Simplify<ThreadEditFields & ThreadListFields>;

