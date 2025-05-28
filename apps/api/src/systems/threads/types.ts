import type { EARS, MessageEntity, TagEntity, ThreadEntity } from "@/types";

export type ThreadsViewData = {
  messages?: Partial<MessageEntity>[];
  relatedThreads?: Partial<ThreadEntity>[];
  tags?: Partial<TagEntity>[];
}

export type NewThread = Omit<ThreadEntity, 'id' | 'createdAt' | 'updatedAt' | 'shortCode'>;

export type ThreadTypeCodes = 'U' | 'P' | 'WI';
export type ThreadTypeShortCode = `${ThreadTypeCodes}-${number}`;

export type ThreadLinkRelation = 'parent_of' | 'blocks' | 'blocked_by' | 'duplicates';
export type ThreadLink = {
  relation: ThreadLinkRelation;
  id: EARS.EntityId;
}