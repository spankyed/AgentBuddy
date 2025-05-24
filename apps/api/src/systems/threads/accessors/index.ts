import { tx } from '@/shared/ears/helpers/transaction';                      // path to the helper file
import { EARS } from '@/shared/ears/types';
import type { MessageEntity, TagEntity, ThreadEntity } from '@/shared/types';
import type { ThreadsViewData } from '../types';
import { getRelatedAttributes } from '@/shared/ears/helpers/get-related-attributes';

type NewThread = Omit<ThreadEntity, 'id' | 'createdAt' | 'updatedAt'>;

export function createThread(thread: NewThread) {
  tx(EARS.Entity.Thread)
    .set('topic', thread.topic)
    .set('timestamp', thread.timestamp)
    .set('shortCode', thread.shortCode)
    .set('threadType', thread.threadType)
    .set('status', thread.status)
    .id();                                                    // returns new thread ID
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
    EARS.RelKind.PARENT_OF,
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
