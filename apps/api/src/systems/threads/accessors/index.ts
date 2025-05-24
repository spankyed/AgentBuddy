// latest‑message.ts  ── same behaviour, now powered by the `tx` helper
import {
  queryEntitiesByRole,
  queryEntitiesByRelationTo,
  getAttribute,
} from '@/shared/ears/attribute-storage';
import { tx } from '@/shared/ears/helpers/transaction';                      // path to the helper file
import { EARS } from '@/shared/ears/types';
import type { MessageEntity, TagEntity, ThreadEntity } from '@/shared/types';
import type { ThreadsViewData } from '../types';

/*──────────────────────── helpers ────────────────────────*/
const LATEST_THREAD  = EARS.RoleKind.Custom('latest_thread');
const LATEST_MESSAGE = EARS.RoleKind.Custom('latest_message');

const latestThreadId = (): EARS.EntityId | undefined =>
  queryEntitiesByRole(LATEST_THREAD)[0];

const latestMessageId = (): EARS.EntityId | undefined =>
  queryEntitiesByRole(LATEST_MESSAGE)[0];

/*──────────────────── public API ─────────────────────────*/

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

function getThreadMessages(threadId: EARS.EntityId): Partial<MessageEntity>[] {
  const childIds = queryEntitiesByRelationTo(EARS.RelKind.CONTAINS, threadId, true);
  const messagePrefix = `${EARS.Entity.Message}-`;
  const filteredMsgs = childIds.filter(msgId => msgId.startsWith(messagePrefix));

  return filteredMsgs.map(msgId => ({
    id: msgId,
    content: getAttribute(msgId, EARS.AttrKind.Custom('content')) as string,
    sender: getAttribute(msgId, EARS.AttrKind.Custom('sender')) as MessageEntity['sender'],
    timestamp: Number(getAttribute(msgId, EARS.AttrKind.Custom('timestamp'))),
  }));
}

function getThreadTags(threadId: EARS.EntityId): Partial<TagEntity>[]  {
  const childIds = queryEntitiesByRelationTo(EARS.RelKind.HAS, threadId, true);
  const tagPrefix = `${EARS.Entity.Tag}-`;
  const filteredTags = childIds.filter(tagId => tagId.startsWith(tagPrefix));

  return filteredTags.map(tagId => ({
    id: tagId,
    name: getAttribute(tagId, EARS.AttrKind.Custom('name')) as string,
    color: getAttribute(tagId, EARS.AttrKind.Custom('color')) as string,
  }));
}

function getThreadRelatedThreads(threadId: EARS.EntityId): Partial<ThreadEntity>[] {
  const childIds = queryEntitiesByRelationTo(EARS.RelKind.PARENT_OF, threadId, true);
  
  return childIds.map(childId => ({
    id: childId,
    shortCode: getAttribute(childId, EARS.AttrKind.Custom('shortCode')) as string,
    topic: getAttribute(childId, EARS.AttrKind.Custom('topic')) as string,
    threadType: getAttribute(childId, EARS.AttrKind.Custom('threadType')) as ThreadEntity['threadType'],
    status: getAttribute(childId, EARS.AttrKind.Custom('status')) as ThreadEntity['status'],
  }));
}

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
  
  