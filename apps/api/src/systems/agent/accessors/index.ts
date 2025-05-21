// latest‑message.ts  ── same behaviour, now powered by the `tx` helper
import {
  queryEntitiesByRole,
  queryEntitiesByRelationTo,
  getAttribute,
} from '@/shared/ears/attribute-storage';
import { tx } from '@/shared/ears/transaction';                      // path to the helper file
import { EARS } from '@/shared/ears/types';

/*──────────────────────── helpers ────────────────────────*/
const LATEST_THREAD  = EARS.RoleKind.Custom('latest_thread');
const LATEST_MESSAGE = EARS.RoleKind.Custom('latest_message');

const latestThreadId = (): EARS.EntityId | undefined =>
  queryEntitiesByRole(LATEST_THREAD)[0];

const latestMessageId = (): EARS.EntityId | undefined =>
  queryEntitiesByRole(LATEST_MESSAGE)[0];

/*──────────────────── public API ─────────────────────────*/

/** create a Message, attach it to the “latest thread”, mark it as newest */
export function addMessageToLatestThread(text: string) {
  const threadId = latestThreadId();
  if (!threadId) return console.warn('No latest thread found');

  tx(EARS.Entity.Message)
    .set('text', text)
    .set('timestamp', new Date())
    .rel(EARS.RelKind.CONTAINS, threadId)
    .uniqueRole(LATEST_MESSAGE)               // bump exclusive flag
    .id();                                                    // returns new message ID
}

/** re‑flag an existing message entity as the latest for (optionally) a thread */
export function setNewMessage(msgId: EARS.EntityId, threadId = latestThreadId()) {
  if (!threadId) return console.warn('No latest thread found');

  // ensure relation & swap exclusive role
  tx(msgId)
    .rel(EARS.RelKind.CONTAINS, threadId)                     // idempotent add
    .uniqueRole(LATEST_MESSAGE)
    .id();
}

/** convenience accessor for the newest message’s text */
export function getLatestMessage(): string | undefined {
  const msgId = latestMessageId();
  return msgId ? getAttribute(msgId, EARS.AttrKind.Custom('text')) as string : undefined;
}