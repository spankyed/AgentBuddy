import { EARS } from '@/shared/ears/types';
import { qx } from '@/shared/ears/helpers/query';
import type { AgentThreadData, AgentStartupData } from '../types';
import type { MessageEntity, ThreadEntity } from '@/shared/types';
import { rows } from '@/systems/_backend/mock-data';
import { byEntityType } from '../types';

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