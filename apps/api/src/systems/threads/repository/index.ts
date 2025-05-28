import { tx } from '@/shared/ears/helpers/transaction';                      // path to the helper file
import { EARS } from '@/shared/ears/types';
import type { MessageEntity, TagEntity, ThreadEntity } from '@/shared/types';
import type { ThreadsViewData } from '../types';
import { getRelatedAttributes } from '@/shared/ears/helpers/get-related-attributes';
import { getEntitiesOfType } from '@/shared/ears';

type NewThread = Omit<ThreadEntity, 'id' | 'createdAt' | 'updatedAt' | 'shortCode'>;

type ThreadTypeCodes = 'U' | 'P' | 'WI';
type ThreadTypeShortCode = `${ThreadTypeCodes}-${number}`;

export type ThreadLinkRelation = 'parent_of' | 'blocks' | 'blocked_by' | 'duplicates';
export type ThreadLink = {
  relation: ThreadLinkRelation;
  id: EARS.EntityId;
}

export function createTag(name: string) {
  const tagId = tx(EARS.Entity.Tag)
    .set('name', name)
    .set('createdAt', Date.now())
    .set('updatedAt', Date.now())
    .id();

  return tagId;
}

export function updateTag(id: EARS.EntityId, props: Partial<TagEntity>) {
  tx(id)
    .set('name', props.name)
    .set('color', props.color)
    .set('updatedAt', Date.now());
}

export function createThread(thread: NewThread, tags?: EARS.EntityId[], relatedThreads?: ThreadLink[]) {
  const threadCount = getEntitiesOfType(EARS.Entity.Thread).length;
  const shortCodesMap: Record<ThreadEntity['threadType'], ThreadTypeCodes> = {
    'work-item': 'WI',
    'project': 'P',
    'user': 'U',
  } as const;

  const shortCode = `${shortCodesMap[thread.threadType]}-${threadCount}` as ThreadTypeShortCode;

  const newThreadId = tx(EARS.Entity.Thread)
    .set('topic', thread.topic)
    .set('instructions', thread.instructions)
    .set('timestamp', thread.timestamp)
    .set('shortCode', shortCode)
    .set('threadType', thread.threadType)
    .set('status', thread.status)
    .set('createdAt', thread.timestamp)
    .set('updatedAt', thread.timestamp)
    .id(); // returns new thread ID

  for (const tag of tags ?? []) {
    tx(newThreadId)
      .rel(EARS.RelKind.HAS, tag);
  }

  for (const relatedThread of relatedThreads ?? []) {
    tx(newThreadId)
      .rel(EARS.RelKind.Custom(relatedThread.relation), relatedThread.id);
  }

  return { id: newThreadId, shortCode };
}

export function updateAttribute(threadId: EARS.EntityId, attr: EARS.AttrKind | string, value: unknown) {
  tx(threadId)
    .set(attr, value);
}


const getThreadMessages = (threadId: EARS.EntityId) =>
  getRelatedAttributes<Partial<MessageEntity>>(
    threadId,
    EARS.RelKind.CONTAINS,
    EARS.Entity.Message,
    {
      text: EARS.AttrKind.Custom('text'),
      sender:  EARS.AttrKind.Custom('sender'),
      timestamp: EARS.AttrKind.Custom('timestamp'),
    }
  );

const getThreadTags = (threadId: EARS.EntityId) =>
  getRelatedAttributes<Partial<TagEntity>>(
    threadId,
    EARS.RelKind.HAS,
    EARS.Entity.Tag,
    {
      name: EARS.AttrKind.Custom('name'),
      color: EARS.AttrKind.Custom('color'),
    }
  );

const getThreadRelatedThreads = (threadId: EARS.EntityId) =>
  getRelatedAttributes<Partial<ThreadEntity>>(
    threadId,
    EARS.RelKind.Custom('parent_of'),
    EARS.Entity.Thread,
    {
      shortCode: EARS.AttrKind.Custom('shortCode'),
      topic: EARS.AttrKind.Custom('topic'),
      threadType: EARS.AttrKind.Custom('threadType'),
      status: EARS.AttrKind.Custom('status'),
    }
  );

export function getViewData(threadId: EARS.EntityId): ThreadsViewData {
  const messages = getThreadMessages(threadId);
  const tags = getThreadTags(threadId);
  const relatedThreads = getThreadRelatedThreads(threadId);

  return {
    messages,
    tags,
    relatedThreads,
  };
}
