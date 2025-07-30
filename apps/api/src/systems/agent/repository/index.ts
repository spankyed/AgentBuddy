import { EARS } from '@/core/types';
import { qx } from '@/core/utils/ears/helpers/query';
import { tx } from '@/core/utils/ears/helpers/transaction';
import { 
  successResult,
  errorResult,
  RepositoryError,
  RepositoryErrorCode,
  type RepositoryResult
} from '@/core/utils/repository';
// import { Rows, rows } from '@/core/data'; // ! remove asap
import { MessageEntity, ThreadEntity, ArtifactEntity } from '@/systems/threads/types';
import { AgentThreadData, AgentThreadRefreshData, Tab } from '../types';

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
  // Get thread artifacts
  threadArtifacts: (threadId: EARS.EntityId) => {
    return qx()
      .relatedTo(threadId)
      .ofType(EARS.Entity.Artifact)
      .pick(['id', 'title', 'content', 'artifactType'] as const)
      .map(artifact => ({
        id: artifact.id,
        type: artifact.artifactType,
        title: artifact.title,
        content: artifact.content
      }));
  },
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
      artifacts: (qx(EARS.Entity.Artifact).pick(['id', 'title', 'content', 'artifactType'] as const) ?? []) as any as ArtifactEntity[],
    };
  },
  
  // Get startup data with recent threads
  startupData: (): AgentThreadRefreshData => {
    const fourMostRecentThreads = qx(EARS.Entity.Thread)
      .orderBy('lastMessageTimestamp', 'desc')
      .limit(4)
      .pick([
        "shortCode",
        "topic",
        "instructions",
        "status",
        "timestamp",
        "lastMessageTimestamp",
      ] as const) as Partial<ThreadEntity>[];
    
    // Get dashboard tab
    const dashboardTab = qx(EARS.Entity.Thread)
      .withRole('catchup_thread')
      .pick(['id', 'topic'] as const)[0];
    
    // Get dashboard artifacts
    const dashboardArtifacts = dashboardTab 
      ? qx(dashboardTab.id)
          .linksPick(
            EARS.RelKind.HAS,
            ['id', 'title', 'content', 'artifactType'] as const,
            EARS.Entity.Artifact,
          )?.map(artifact => ({
            id: artifact.id,
            type: artifact.artifactType,
            title: artifact.title || '',
            content: artifact.content,
            metadata: {
              createdAt: Date.now()
            }
          })) ?? []
      : [];
    
    // Construct tabs array
    const tabs: Tab[] = dashboardTab 
      ? [{
          id: 'dashboard',
          label: String(dashboardTab.topic || 'Dashboard'),
          artifacts: dashboardArtifacts,
          selectedArtifactId: dashboardArtifacts[0]?.id
        }]
      : [];
    
    if (fourMostRecentThreads.length === 0) {
      return {
        currentThread: null,
        threads: [],
        dashboardArtifacts: qx()
          .withRole('dashboard_artifact')
          .pick(['id', 'title', 'content', 'artifactType'] as const) as any as Partial<ArtifactEntity>[],
        tabs,
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
        artifacts: (qx(EARS.Entity.Artifact).pick(['id', 'title', 'content', 'artifactType'] as const) ?? []) as any as ArtifactEntity[],
      } as AgentThreadData,
      threads: fourMostRecentThreads,
      dashboardArtifacts: qx()
        .withRole('dashboard_artifact')
        .pick(['id', 'title', 'content', 'artifactType'] as const) as any as Partial<ArtifactEntity>[],
      tabs,
    };
  },
} as const;

// Commands - write operations that modify data
export const agentCommands = {
  addMessage: (params: {
    threadId: EARS.EntityId;
    text: string;
    sender: 'user' | 'assistant' | 'system';
  }): RepositoryResult<{
    id: EARS.EntityId;
    threadId: EARS.EntityId;
    text: string;
    sender: string;
    timestamp: number;
  }> => {
    try {
      const { threadId, text, sender } = params;
      
      // Validate thread exists
      const thread = qx(threadId).id();
      if (!thread) {
        throw new RepositoryError(`Thread ${threadId} not found`, RepositoryErrorCode.NOT_FOUND);
      }
      
      // Validate sender
      const validSenders = ['user', 'assistant', 'system'];
      if (!validSenders.includes(sender)) {
        throw new RepositoryError(
          `Invalid sender type. Must be one of: ${validSenders.join(', ')}`,
          RepositoryErrorCode.VALIDATION_ERROR
        );
      }
      
      // Create the message
      const timestamp = Date.now();
      const messageId = tx(EARS.Entity.Message)
        .put('text', text.trim())
        .put('timestamp', timestamp)
        .put('sender', sender)
        .put('createdAt', timestamp)
        .put('updatedAt', timestamp)
        .link(EARS.RelKind.CONTAINS, threadId)
        .id();
      
      // Link thread to message
      tx(threadId).link(EARS.RelKind.CONTAINS, messageId);
      
      // Update thread's lastMessageTimestamp
      tx(threadId).put('lastMessageTimestamp', timestamp);
      
      return successResult({
        id: messageId,
        threadId,
        text: text.trim(),
        sender,
        timestamp
      });
    } catch (error) {
      return errorResult(error);
    }
  },
} as const;