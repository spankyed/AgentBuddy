import { qx } from "@/shared/ears/helpers/query";
import { EARS } from "@/shared/ears/types";
import { AgentThreadData } from "../types";
import { rows } from "@/systems/_backend/mock-data";
import { byEntityType } from '../types';
import { MessageEntity } from "@/types";

export function getThreadChatData(
  threadId: EARS.EntityId,
): AgentThreadData {
  const thread = qx(threadId)
    .orderBy('timestamp', 'desc')
    .limit(4)
    .rows([
      "shortCode",
      "topic",
      "instructions",
      "status",
      "timestamp",
    ] as const);
  return {
    ...thread[0] as AgentThreadData,
    messages: qx(threadId)
      .linkRows(
        EARS.RelKind.CONTAINS,
        EARS.Entity.Message,
        ["id", "text", "sender", "timestamp"] as const,
      ) ?? [] as Partial<MessageEntity>[],
    contextItems: rows.entity.filter(byEntityType(EARS.Entity.ContextItem)),
    canvasContent: rows.entity.filter(byEntityType(EARS.Entity.CanvasItem))[0],
}
}
