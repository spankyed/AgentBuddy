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
import { AgentThreadData, RecentThreadRefreshData, AgentStartupData, Tab, ArtifactType, ArtifactItem } from '../types';
import { getDashboardTab } from './dashboard';

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

// Helper function to get threads with optional current thread data
interface ThreadsQueryOptions {
  limit?: number;
  orderBy?: keyof ThreadEntity;
  orderDirection?: 'asc' | 'desc';
  includeCurrentThreadData?: boolean;
  threadFields?: readonly (keyof ThreadEntity)[];
  messageFields?: readonly (keyof MessageEntity)[];
  artifactFields?: readonly (keyof ArtifactEntity)[];
}

function getThreadsWithOptionalCurrent(options: ThreadsQueryOptions = {}): { 
  threads: Partial<ThreadEntity>[]; 
  currentThreadData: AgentThreadData | null 
} {
  const {
    limit = 4,
    orderBy = 'lastMessageTimestamp',
    orderDirection = 'desc',
    includeCurrentThreadData = true,
    threadFields = [
      "shortCode",
      "topic",
      "instructions",
      "status",
      "timestamp",
      "lastMessageTimestamp",
    ] as const,
    messageFields = ["id", "text", "sender", "timestamp"] as const,
    artifactFields = ['id', 'title', 'content', 'artifactType'] as const,
  } = options;

  const threads = qx(EARS.Entity.Thread)
    .orderBy(orderBy, orderDirection)
    .limit(limit)
    .pick(threadFields) as Partial<ThreadEntity>[];
  
  if (threads.length === 0 || !includeCurrentThreadData) {
    return {
      threads,
      currentThreadData: null
    };
  }
  
  const currentThread = threads[0];
  
  const currentThreadData: AgentThreadData = {
    id: currentThread.id,
    shortCode: currentThread.shortCode,
    topic: currentThread.topic || '',
    instructions: currentThread.instructions || '',
    status: currentThread.status || 'backlog',
    timestamp: currentThread.timestamp || Date.now(),
    messages: currentThread.id 
      ? (qx(currentThread.id)
          .linksPick(
            EARS.RelKind.CONTAINS,
            messageFields,
            EARS.Entity.Message,
          ) ?? []) as Partial<MessageEntity>[]
      : [],
    artifacts: (qx(EARS.Entity.Artifact).pick(artifactFields) ?? []) as any as ArtifactEntity[],
  };
  
  return {
    threads,
    currentThreadData
  };
}

// Helper function to get artifacts for a thread/entity
function getArtifactsForEntity(entityId: EARS.EntityId, relationKind: EARS.RelKind = EARS.RelKind.HAS): ArtifactItem[] {
  const artifacts = qx(entityId)
    .linksPick(
      relationKind,
      ['id', 'title', 'content', 'artifactType'] as const,
      EARS.Entity.Artifact,
    );
  
  if (!artifacts || artifacts.length === 0) {
    return [];
  }
  
  return artifacts.map(artifact => ({
    id: artifact.id,
    type: (artifact.artifactType || 'text') as ArtifactType,
    title: String(artifact.title || ''),
    content: artifact.content,
    metadata: {
      createdAt: Date.now()
    }
  }));
}

// Helper function to create a tab from thread data
function createTabFromThread(
  thread: { id?: EARS.EntityId; topic?: string; shortCode?: string },
  artifacts: ArtifactItem[],
  tabId?: string
): Tab | null {
  if (!thread.id || artifacts.length === 0) {
    return null;
  }
  
  return {
    id: tabId || thread.id,
    label: thread.topic || `Thread ${thread.shortCode || ''}`,
    artifacts,
    selectedArtifactId: artifacts[0]?.id
  };
}

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
  
  // Get refresh threads data (without tabs)
  refreshThreadsData: (): RecentThreadRefreshData => {
    const { threads, currentThreadData } = getThreadsWithOptionalCurrent();
    
    return {
      currentThread: currentThreadData,
      threads,
    };
  },
  
  // Get startup data with recent threads and tabs
  startupData: (): AgentStartupData => {
    // Get recent threads and current thread data
    const { threads, currentThreadData } = getThreadsWithOptionalCurrent();
    
    // Get dashboard tab
    const { tab: dashboardTab, threadId: dashboardThreadId } = getDashboardTab(createTabFromThread);
    
    // Initialize tabs array
    const tabs: Tab[] = [];
    
    // Add dashboard tab if it exists
    if (dashboardTab) {
      tabs.push(dashboardTab);
    }
    
    // Add current thread tab if it's not the dashboard thread
    if (currentThreadData?.id && currentThreadData.id !== dashboardThreadId) {
      const artifacts = qx()
        .relatedTo(currentThreadData.id)
        .ofType(EARS.Entity.Artifact)
        .pick(['id', 'title', 'content', 'artifactType'] as const)
        .map(artifact => ({
          id: artifact.id,
          type: (artifact.artifactType || 'text') as ArtifactType,
          title: String(artifact.title || ''),
          content: artifact.content,
          metadata: {
            createdAt: Date.now()
          }
        })) as ArtifactItem[];
      
      const threadTab = createTabFromThread(currentThreadData, artifacts);
      if (threadTab) {
        tabs.push(threadTab);
      }
    }
    
    // Get dashboard artifacts for legacy support
    const dashboardArtifacts = qx()
      .withRole('dashboard_artifact')
      .pick(['id', 'title', 'content', 'artifactType'] as const) as any as Partial<ArtifactEntity>[];

    return {
      currentThread: currentThreadData,
      threads,
      dashboardArtifacts,
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
      tx(threadId).update('lastMessageTimestamp', timestamp);
      
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