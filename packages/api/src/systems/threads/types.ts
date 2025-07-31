import { BaseEntity } from "@/core/utils/ears";
import type { Simplify } from "@/core/utils/type-helpers";
import type { EARS } from "@/types";

export interface MessageEntity extends BaseEntity {
  entityType: EARS.Entity.Message;
  text: string;
  sender: 'user' | 'assistant' | 'system';
  timestamp: number;
}

export interface ThreadEntity extends BaseEntity {
  entityType: EARS.Entity.Thread;
  topic: string;
  instructions: string;
  sideTopics?: string[];
  timestamp: number;
  lastMessageTimestamp?: number;
  shortCode?: string;
  threadType: 'work-item' | 'project' | 'user';
  status: 'backlog' | 'open' | 'in-progress' | 'in-review' | 'done';
}

export interface ArtifactEntity extends BaseEntity {
  entityType: EARS.Entity.Artifact;
  title?: string;
  // biome-ignore lint/suspicious/noExplicitAny: Content can be various types
  content: string | any;
  artifactType: 'text' | 'code' | 'image' | 'json' | 'graph' | 'table' | 'kanban' | 'slack';
}

export interface TagEntity extends BaseEntity {
  entityType: EARS.Entity.Tag;
  name: string;
  color?: string;
}

export type ThreadTypeCodes = 'U' | 'P' | 'WI';
export type ThreadTypeShortCode = `${ThreadTypeCodes}-${number}`;

export const ThreadStatuses = ['backlog', 'open', 'in-progress', 'in-review', 'done'] as const;
export const ThreadRelations = ['parent_of', 'blocks', 'blocked_by', 'duplicates'] as const;

export type ThreadStatus = typeof ThreadStatuses[number];
export type ThreadLinkRelation = typeof ThreadRelations[number];

export type ThreadLinkItem = Pick<ThreadEntity, 'id' | 'shortCode' | 'status' | 'timestamp' | 'topic' | 'threadType'> & {
  relation: ThreadLinkRelation
};
export type ThreadTagItem = Omit<TagEntity, 'createdAt' | 'updatedAt' | 'entityType'>

export type ThreadEditFields = Simplify<
  Pick<ThreadEntity, 'topic' | 'threadType' | 'instructions'>
  & { status?: ThreadEntity['status'] }
  & ThreadLinkedFields
>;
export type ThreadLinkedFields = {
  tags?: ThreadTagItem[];
  linkedThreads?: ThreadLinkItem[];
}

export type ThreadCreateData = Simplify<ThreadEditFields>;
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
export type ThreadExtendedData = ThreadLinkedFields & {
  messages?: Partial<MessageEntity>[];
}

export type ThreadStartupData = {
  threads: ThreadExtended[];
  availableTags: TagEntity[];
}
