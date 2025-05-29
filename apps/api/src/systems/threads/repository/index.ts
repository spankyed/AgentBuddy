import { tx } from '@/shared/ears/helpers/transaction';                      // path to the helper file
import { EARS } from '@/shared/ears/types';
import type { MessageEntity, TagEntity, ThreadEntity } from '@/shared/types';
import { type ThreadLinkRelation, ThreadRelations, type ThreadCreateData, type ThreadRelatedData, type ThreadTypeCodes, type ThreadTypeShortCode, type ThreadLinkItem } from '../types';
import { getRelatedEntities } from '@/shared/ears/helpers/get-related-attributes';
import { getEntitiesOfType } from '@/shared/ears';

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

export function createThread(thread: ThreadCreateData) {
  const timestamp = Date.now();
  const threadCount = getEntitiesOfType(EARS.Entity.Thread).length;
  const shortCodesMap: Record<ThreadEntity['threadType'], ThreadTypeCodes> = {
    'work-item': 'WI',
    'project': 'P',
    'user': 'U',
  } as const;

  const shortCode = `${shortCodesMap[thread.threadType]}-${threadCount}` as ThreadTypeShortCode;

  const newThreadId = tx(EARS.Entity.Thread)
    .set('status', 'draft')
    .set('shortCode', shortCode)
    .set('timestamp', timestamp)
    .set('createdAt', timestamp)
    .set('updatedAt', timestamp)
    .set('topic', thread.topic)
    .set('instructions', thread.instructions)
    .set('threadType', thread.threadType)
    .id(); // returns new thread ID

  for (const tag of thread.tagsInput ?? []) {
    tx(newThreadId)
      .rel(EARS.RelKind.HAS, tag.id);
  }

  for (const relatedThread of thread.relatedThreadsInput ?? []) {
    tx(newThreadId)
      .rel(EARS.RelKind.Custom(relatedThread.relation), relatedThread.thread.id);
  }

  return { id: newThreadId, shortCode, timestamp };
}

export function updateAttribute(threadId: EARS.EntityId, attr: EARS.AttrKind | string, value: unknown) {
  tx(threadId)
    .set(attr, value);
}

const getThreadMessages = (threadId: EARS.EntityId) =>
  getRelatedEntities<Partial<MessageEntity>>(
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
  getRelatedEntities<Partial<TagEntity>>(
    threadId,
    EARS.RelKind.HAS,
    EARS.Entity.Tag,
    {
      name: EARS.AttrKind.Custom('name'),
      color: EARS.AttrKind.Custom('color'),
    }
  );

const getRelatedThread = (threadId: EARS.EntityId, relation: ThreadLinkRelation) =>
  getRelatedEntities<Partial<ThreadEntity>>(
    threadId,
    EARS.RelKind.Custom(relation),
    EARS.Entity.Thread,
    {
      shortCode: EARS.AttrKind.Custom('shortCode'),
      topic: EARS.AttrKind.Custom('topic'),
      threadType: EARS.AttrKind.Custom('threadType'),
      status: EARS.AttrKind.Custom('status'),
    }
  );
const getRelatedThreads = (threadId: EARS.EntityId) =>
  ThreadRelations
    .flatMap(rel => 
      getRelatedThread(threadId, rel).map(thread => ({
        thread,
        relation: rel,
      }))
    );

type Include = keyof ThreadRelatedData;
export function getExtendedData(threadId: EARS.EntityId, include?: Include | Include[]): ThreadRelatedData {
  const extendedData = {} as ThreadRelatedData;

  if (!include || include.includes('messages')) {
    extendedData.messages = getThreadMessages(threadId);
  }

  if (!include || include.includes('tags')) {
    extendedData.tags = getThreadTags(threadId);
  }

  if (!include || include.includes('relatedThreads')) {
    extendedData.relatedThreads = getRelatedThreads(threadId) as ThreadLinkItem[];
  }

  return extendedData;
}
