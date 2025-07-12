import { EARS } from '@/core/utils/ears/types';
import { qx } from '@/core/utils/ears/helpers/query';
import { Rows, rows } from '@/core/mock-data'; // ! remove asap
import { MessageEntity, ThreadEntity } from '@/systems/threads/types';
import { AgentThreadData, AgentStartupData } from '../types';

type Row = Rows['entity'][number]

export function byEntityType<
  K extends Row['entityType']
>(type: K): (r: Row) => r is Extract<Row, { entityType: K }> {
  return (r): r is Extract<Row, { entityType: K }> => r.entityType === type
}

/**
 * Agent Repository - Aggregates data from threads, messages, and other entities
 */

// Queries - read-only operations that compose data
export const agentQueries = {
  // Get thread data with messages and context
  threadData: (threadId: EARS.EntityId): AgentThreadData => {
    const thread = qx(threadId)
      .orderBy('timestamp', 'desc')
      .limit(4)
      .pick([
        "shortCode",
        "topic",
        "instructions",
        "status",
        "timestamp",
      ] as const);
    
    return {
      ...thread[0] as AgentThreadData,
      messages: qx(threadId)
        .linksPick(
          EARS.RelKind.CONTAINS,
          ["id", "text", "sender", "timestamp"] as const,
          EARS.Entity.Message,
        ) ?? [] as Partial<MessageEntity>[],
      contextItems: rows.entity.filter(byEntityType(EARS.Entity.ContextItem)),
      canvasContent: rows.entity.filter(byEntityType(EARS.Entity.CanvasItem))[0],
    };
  },
  
  // Get startup data with recent threads
  startupData: (): AgentStartupData => {
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
            ["id", "text", "sender", "timestamp"] as const,
            EARS.Entity.Message,
          ) ?? [] as Partial<MessageEntity>[],
        contextItems: rows.entity.filter(byEntityType(EARS.Entity.ContextItem)),
        canvasContent: rows.entity.filter(byEntityType(EARS.Entity.CanvasItem))[0],
      } as AgentThreadData,
      threads: fourMostRecentThreads,
    };
  },
} as const;