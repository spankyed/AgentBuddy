import { EARS } from '@/shared/ears/types';
import type { MessageEntity, Rows, TagEntity, ThreadEntity } from '@/shared/types';
import type { AgentStartupData, AgentThreadData } from '@/types';
import { qx } from '@/shared/ears/helpers/query';
import { rows } from '@/systems/_backend/mock-data';
import { byEntityType } from '../types';

export default function agentStartupData(): AgentStartupData {
  const fourMostRecentThreads = qx(EARS.Entity.Thread)
    .orderBy('timestamp', 'desc')
    .limit(4)
    .pick([
      "shortCode",
      "topic",
      "instructions",
      "status",
      "timestamp",
    ] as const) as Partial<ThreadEntity>[];
  
  const currentThread = fourMostRecentThreads[0];

  return {
    currentThread: {
      ...currentThread,
      messages: qx(currentThread.id)
        .linksPick(
          EARS.RelKind.CONTAINS,
          EARS.Entity.Message,
          ["id", "text", "sender", "timestamp"] as const,
        ) ?? [] as Partial<MessageEntity>[],
      contextItems: rows.entity.filter(byEntityType(EARS.Entity.ContextItem)),
      canvasContent: rows.entity.filter(byEntityType(EARS.Entity.CanvasItem))[0],
    } as AgentThreadData,
    threads: fourMostRecentThreads,
  }
}