import type { Simplify } from "@/shared/utils/type-helpers";
import type { EARS, MessageEntity, TagEntity, ThreadEntity } from "@/types";

export type ThreadTypeCodes = 'U' | 'P' | 'WI';
export type ThreadTypeShortCode = `${ThreadTypeCodes}-${number}`;

export const ThreadStatuses = ['draft', 'queued', 'active', 'inactive'] as const;
export const ThreadRelations = ['parent_of', 'blocks', 'blocked_by', 'duplicates'] as const;

export type ThreadStatus = typeof ThreadStatuses[number];
export type ThreadLinkRelation = typeof ThreadRelations[number];

export type ThreadLinkItem = {
  thread: Pick<ThreadEntity, 'id' | 'shortCode' | 'status' | 'timestamp' | 'topic' | 'threadType'>;
  relation: ThreadLinkRelation
};
export type ThreadTagItem = Omit<TagEntity, 'createdAt' | 'updatedAt' | 'entityType'>

export type ThreadEditFields = Pick<ThreadEntity, 'topic' | 'threadType' | 'instructions'>;
export type ThreadListFields = {
  tagItems?: ThreadTagItem[];
  threadItems?: ThreadLinkItem[];
}

export type ThreadCreateData = Simplify<ThreadEditFields & ThreadListFields>;
export type ThreadViewData = Simplify<
  ThreadCreateData
  & {
    id: ThreadEntity['id'];
    shortCode: ThreadEntity['shortCode'];
    status: ThreadEntity['status'];
    timestamp: ThreadEntity['timestamp'];
    messages?: ThreadExtendedData['messages'];
  }
>;

export type ThreadExtended = Simplify<ThreadEntity & ThreadExtendedData>;
export type ThreadExtendedData = {
  messages?: Partial<MessageEntity>[];
  relatedThreads?: ThreadLinkItem[];
  tags?: Partial<TagEntity>[];
}

export type ThreadStartupData = {
  threads: ThreadExtended[];
  availableTags: TagEntity[];
}
