import { EARS } from '@/core/types';
import { qx } from '@/core/utils/ears/helpers/query';
// import { Rows, rows } from '@/core/data'; // ! remove asap
import { MessageEntity, ThreadEntity, ContextItemEntity, CanvasContentEntity } from '@/systems/threads/types';
import { AgentThreadData, AgentStartupData } from '../types';

// type Row = Rows['entity'][number]
type Row = any // Temporary fix until Rows type is available

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
      contextItems: (qx(EARS.Entity.ContextItem).pick(['id', 'content'] as const) ?? []) as any as ContextItemEntity[],
      canvasContent: qx(EARS.Entity.CanvasItem).pickOne(['id', 'content'] as const) as any as CanvasContentEntity,
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
    
    if (fourMostRecentThreads.length === 0) {
      return {
        currentThread: null,
        threads: [],
      };
    }
    
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
        contextItems: (qx(EARS.Entity.ContextItem).pick(['id', 'content'] as const) ?? []) as any as ContextItemEntity[],
        canvasContent: qx(EARS.Entity.CanvasItem).pickOne(['id', 'content'] as const) as any as CanvasContentEntity,
      } as AgentThreadData,
      threads: fourMostRecentThreads,
    };
  },
} as const;