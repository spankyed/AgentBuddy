import type { EARS, MessageEntity, TagEntity, ThreadEntity } from "@/types";

export type ThreadExtendedView = {
  messages?: Partial<MessageEntity>[];
  relatedThreads?: Partial<ThreadEntity>[];
  tags?: Partial<TagEntity>[];
}

export type ThreadCreateData = Pick<ThreadEntity, 'topic' | 'threadType' | 'instructions'> & {
  tags: EARS.EntityId[];
  relatedThreads: ThreadLink[];
}

export type ThreadTypeCodes = 'U' | 'P' | 'WI';
export type ThreadTypeShortCode = `${ThreadTypeCodes}-${number}`;

export type ThreadLinkRelation = 'parent_of' | 'blocks' | 'blocked_by' | 'duplicates';
export type ThreadLink = {
  relation: ThreadLinkRelation;
  id: EARS.EntityId;
}