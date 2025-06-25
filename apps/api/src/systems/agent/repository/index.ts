// latest-message.ts — now fully on tx/qx
import { tx } from "@/shared/ears/helpers/transaction";
import { qx } from "@/shared/ears/helpers/query";
import { EARS } from "@/shared/ears/types";
import { createLogger } from '@/systems/logs/logger';

const logger = createLogger('agent-repository');

/*──────────────────────── helpers ────────────────────────*/
const LATEST_THREAD  = EARS.RoleKind.Custom("latest_thread");
const LATEST_MESSAGE = EARS.RoleKind.Custom("latest_message");

// first entity with the given role, or undefined
const latestThreadId  = (): EARS.EntityId | undefined =>
  qx().withRole(LATEST_THREAD).first() ?? undefined;
const latestMessageId = (): EARS.EntityId | undefined =>
  qx().withRole(LATEST_MESSAGE).first() ?? undefined;

/*──────────────────── public API ─────────────────────────*/

export function addMessageToLatestThread(text: string) {
  const threadId = latestThreadId();
  if (!threadId) {
    logger.warn("No latest thread found");
    return;
  }

  tx(EARS.Entity.Message)
    .put("text",      text)
    .put("timestamp", new Date())
    .linkOne(EARS.RelKind.CONTAINS, threadId)
    .ensure(LATEST_MESSAGE)
    .id();
}

export function setNewMessage(
  msgId: EARS.EntityId,
  threadId = latestThreadId(),
) {
  if (!threadId) {
    logger.warn("No latest thread found");
    return;
  }

  tx(msgId)
    .linkOne(EARS.RelKind.CONTAINS, threadId)
    .ensure(LATEST_MESSAGE)
    .id();
}

export function getLatestMessage(): string | undefined {
  return qx()
    .withRole(LATEST_MESSAGE)
    .pickOne(["text"] as const)
    .text;
}