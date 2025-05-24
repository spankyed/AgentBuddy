// latest‑message.ts  ── same behaviour, now powered by the `tx` helper
import {
  queryEntitiesByRole,
  queryEntitiesByRelationTo,
  getAttribute,
} from '@/shared/ears/attribute-storage';
import { tx } from '@/shared/ears/transaction';                      // path to the helper file
import { EARS } from '@/shared/ears/types';
import type { MessageEntity, ThreadEntity } from '@/shared/types';

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

export function getThreadMessages(threadId: EARS.EntityId): Partial<MessageEntity>[] {
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