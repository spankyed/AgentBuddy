import { EARS } from '@/core/types';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import { RepositoryError, RepositoryErrorCode } from '@/core/utils/repository';
// import { Rows, rows } from '@/core/data'; // ! remove asap
import { MessageEntity, ThreadEntity, ArtifactEntity, BlockConfig } from '@/systems/threads/types';
import { AgentThreadData, RecentThreadRefreshData, AgentConnectedData, Tab, ArtifactType, ArtifactItem } from '../types';
import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import { threadCommands } from '@/systems/threads/repository';

// Constants
const THREAD_TOPIC_MAX_LENGTH = 40;

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
    includeCurrentThreadData = true,
    threadFields = [
      "shortCode",
      "topic",
      "instructions",
      "status",
      "timestamp",
      "lastMessageTimestamp",
      "lastVisitedTimestamp",
      "forcedMode",
    ] as const,
    messageFields = ["id", "text", "sender", "timestamp", "blocks", "blockResponse", "responseTimestamp"] as const,
    artifactFields = ['id', 'title', 'content', 'artifactType'] as const,
  } = options;

  // Get threads and sort with priority: lastVisitedTimestamp > lastMessageTimestamp > timestamp
  // We need to sort manually since threads may not have lastVisitedTimestamp set
  const allThreads = qx(EARS.Entity.Thread)
    .pick(threadFields) as Partial<ThreadEntity>[];

  const threads = allThreads
    .sort((a, b) => {
      const aTime = a.lastVisitedTimestamp || a.lastMessageTimestamp || a.timestamp || 0;
      const bTime = b.lastVisitedTimestamp || b.lastMessageTimestamp || b.timestamp || 0;
      return bTime - aTime; // Descending order
    })
    .slice(0, limit);
  
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
    forcedMode: currentThread.forcedMode,
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
  // Check if required API keys are configured
  hasRequiredApiKeys: (): boolean => {
    const secrets = settingsQueries.getGeneralSettings().secrets;
    const required = ['openai', 'anthropic']; // Could also read from defaults if needed

    // Check if at least one required key is configured
    return required.some(provider => {
      const secretId = secrets[provider as keyof typeof secrets];
      return secretId !== null && secretId !== undefined && secretId !== '';
    });
  },

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
        "forcedMode",
      ] as const);

    // Get thread-specific artifacts (not all artifacts)
    const threadArtifacts = qx()
      .relatedTo(threadId)
      .ofType(EARS.Entity.Artifact)
      .pick(['id', 'title', 'content', 'artifactType'] as const) ?? [];

    return {
      ...thread[0] as AgentThreadData,
      messages: qx(threadId)
        .linksPick(
          EARS.RelKind.CONTAINS,
          ["id", "text", "sender", "timestamp", "blocks", "blockResponse", "responseTimestamp"] as const,
          EARS.Entity.Message,
        ) ?? [] as Partial<MessageEntity>[],
      artifacts: threadArtifacts as any as ArtifactEntity[],
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
  connectedData: (): AgentConnectedData => {
    // Get recent threads and current thread data
    const { threads, currentThreadData } = getThreadsWithOptionalCurrent();

    // Initialize tabs array
    const tabs: Tab[] = [];

    // Add current thread tab if it has artifacts
    if (currentThreadData?.id) {
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

    // Get agent settings
    const allSettings = settingsQueries.getSettings();
    const agentSettings = allSettings?.plugins?.agent;

    return {
      currentThread: currentThreadData,
      threads,
      tabs,
      settings: agentSettings,
      hasRequiredApiKeys: agentQueries.hasRequiredApiKeys(),
    };
  },

  // Get message by ID
  messageById: (messageId: EARS.EntityId): MessageEntity | null => {
    const message = qx(messageId).pickOne([
      'id',
      'text',
      'sender',
      'timestamp',
      'blocks',
      'blockResponse',
      'responseTimestamp',
      'createdAt',
      'updatedAt'
    ] as const);

    if (!message) return null;

    return {
      ...message,
      entityType: EARS.Entity.Message
    } as MessageEntity;
  }
} as const;

// Commands - write operations that modify data
export const agentCommands = {
  addMessage: (params: {
    threadId: EARS.EntityId;
    text: string;
    sender: 'user' | 'assistant' | 'system';
    blocks?: BlockConfig[];
  }): {
    id: EARS.EntityId;
    threadId: EARS.EntityId;
    text: string;
    sender: string;
    timestamp: number;
  } => {
    const { threadId, text, sender, blocks } = params;

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
    const messageTx = tx(EARS.Entity.Message)
      .put('text', text.trim())
      .put('timestamp', timestamp)
      .put('sender', sender)
      .put('createdAt', timestamp)
      .put('updatedAt', timestamp);

    // Add blocks if provided
    if (blocks) {
      messageTx.put('blocks', blocks);
    }

    const messageId = messageTx
      .link(EARS.RelKind.CONTAINS, threadId)
      .id();

    // Link thread to message
    tx(threadId).link(EARS.RelKind.CONTAINS, messageId);

    // Update thread's lastMessageTimestamp
    tx(threadId).update('lastMessageTimestamp', timestamp);

    return {
      id: messageId,
      threadId,
      text: text.trim(),
      sender,
      timestamp
    };
  },

  createThreadFromMessage: (text: string): {
    threadId: EARS.EntityId;
    threadData: ReturnType<typeof threadCommands.create>;
  } => {
    const threadData = threadCommands.create({
      topic: text.substring(0, THREAD_TOPIC_MAX_LENGTH),
      instructions: '',
    });

    return {
      threadId: threadData.id,
      threadData
    };
  },

  updateMessageBlockResponse: (params: {
    messageId: EARS.EntityId;
    response: any;
  }): {
    messageId: EARS.EntityId;
    responseTimestamp: number;
    updatedAt: number;
    blocks?: BlockConfig[];  // Populated if toggleStates button was toggled
  } => {
    const { messageId, response } = params;

    // Validate message exists
    const message = qx(messageId).id();
    if (!message) {
      throw new RepositoryError(
        `Message ${messageId} not found`,
        RepositoryErrorCode.NOT_FOUND
      );
    }

    const now = Date.now();

    // Save response
    tx(messageId)
      .put('blockResponse', response)
      .put('responseTimestamp', now)
      .put('updatedAt', now);

    // Auto-toggle if button has toggleStates
    let updatedBlocks: BlockConfig[] | undefined;
    const fullMessage = qx(messageId).pickOne(['blocks']);

    if (fullMessage?.blocks && response.buttonId) {
      let buttonToggled = false;
      const newBlocks = fullMessage.blocks.map((block: BlockConfig) => {
        if (block.type === 'button-group') {
          const updatedButtons = block.props.buttons.map((button: any) => {
            if (button.toggleStates && button.id === response.buttonId) {
              buttonToggled = true;
              return { ...button, state: button.state === 'on' ? 'off' : 'on' };
            }
            return button;
          });
          return { ...block, props: { ...block.props, buttons: updatedButtons } };
        }
        return block;
      });

      if (buttonToggled) {
        updatedBlocks = newBlocks;
        // Persist blocks update
        tx(messageId).put('blocks', newBlocks).put('updatedAt', now);
      }
    }

    return {
      messageId,
      responseTimestamp: now,
      updatedAt: now,
      ...(updatedBlocks && { blocks: updatedBlocks })
    };
  },

  updateMessageState: (params: {
    messageId: EARS.EntityId;
    updates: Partial<Pick<MessageEntity, 'text' | 'blocks' | 'blockResponse' | 'responseTimestamp'>>;
  }): {
    messageId: EARS.EntityId;
    updatedAt: number;
    updates: typeof params.updates;
  } => {
    const { messageId, updates } = params;

    // Validate message exists
    const message = qx(messageId).id();
    if (!message) {
      throw new RepositoryError(
        `Message ${messageId} not found`,
        RepositoryErrorCode.NOT_FOUND
      );
    }

    const now = Date.now();
    const updateData: Record<string, any> = {
      ...updates,
      updatedAt: now
    };

    // Apply all updates in a single transaction
    tx(messageId).updateBatch(updateData);

    return {
      messageId,
      updatedAt: now,
      updates
    };
  },

  createArtifact: (params: {
    artifactType: ArtifactType;
    title: string;
    content: any;
    threadId?: EARS.EntityId;
  }): { artifactId: EARS.EntityId } => {
    const { artifactType, title, content, threadId } = params;

    // Create the artifact entity
    const artifactId = tx(EARS.Entity.Artifact)
      .put('entityType', EARS.Entity.Artifact)
      .put('title', title)
      .put('artifactType', artifactType)
      .put('content', content)
      .put('createdAt', Date.now())
      .id();

    // Link to thread if provided
    if (threadId) {
      tx(threadId).link(EARS.RelKind.HAS, artifactId);
      tx(artifactId).link(EARS.RelKind.RELATES_TO, threadId);
    }

    return { artifactId };
  },

} as const;