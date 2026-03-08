import { EARS } from '@/core/types';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import { RepositoryError, RepositoryErrorCode } from '@/core/helpers/repository';
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

/**
 * Get recent threads sorted by priority
 * Priority: lastVisitedTimestamp > lastMessageTimestamp > timestamp (descending)
 */
function getRecentThreads(limit: number = 4): Partial<ThreadEntity>[] {
  const threadFields = [
    "shortCode",
    "topic",
    "instructions",
    "status",
    "timestamp",
    "lastMessageTimestamp",
    "lastVisitedTimestamp",
    "forcedMode",
  ] as const;

  const allThreads = qx(EARS.Entity.Thread)
    .pick(threadFields) as Partial<ThreadEntity>[];

  return allThreads
    .sort((a, b) => {
      const aTime = a.lastVisitedTimestamp || a.lastMessageTimestamp || a.timestamp || 0;
      const bTime = b.lastVisitedTimestamp || b.lastMessageTimestamp || b.timestamp || 0;
      return bTime - aTime; // Descending order
    })
    .slice(0, limit);
}

/**
 * Get recent threads with full current thread data (messages and artifacts)
 * Current thread is the most recent thread by priority
 */
function getThreadsWithCurrent(limit: number = 4): {
  threads: Partial<ThreadEntity>[];
  currentThread: AgentThreadData | null;
} {
  const threads = getRecentThreads(limit);

  if (threads.length === 0) {
    return { threads, currentThread: null };
  }

  const mostRecentThread = threads[0];

  const messageFields = ["id", "text", "sender", "timestamp", "blocks", "blockResponse", "responseTimestamp", "forkable"] as const;

  const currentThread: AgentThreadData = {
    id: mostRecentThread.id,
    shortCode: mostRecentThread.shortCode,
    topic: mostRecentThread.topic || '',
    instructions: mostRecentThread.instructions || '',
    status: mostRecentThread.status || 'backlog',
    timestamp: mostRecentThread.timestamp || Date.now(),
    forcedMode: mostRecentThread.forcedMode,
    messages: mostRecentThread.id
      ? (qx(mostRecentThread.id)
          .linksPick(
            EARS.RelKind.CONTAINS,
            messageFields,
            EARS.Entity.Message,
          ) ?? []) as Partial<MessageEntity>[]
      : [],
    artifacts: mostRecentThread.id
      ? (qx()
          .relatedTo(mostRecentThread.id)
          .ofType(EARS.Entity.Artifact)
          .pick(['id', 'title', 'content', 'artifactType'] as const) ?? []) as any as ArtifactEntity[]
      : [],
  };

  return { threads, currentThread };
}

// Helper function to get artifacts for a thread
function getThreadArtifacts(threadId: EARS.EntityId): ArtifactItem[] {
  const artifacts = qx()
    .relatedTo(threadId)
    .ofType(EARS.Entity.Artifact)
    .pick(['id', 'title', 'content', 'artifactType'] as const);

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
        "pinned",
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
          ["id", "text", "sender", "timestamp", "blocks", "blockResponse", "responseTimestamp", "forkable"] as const,
          EARS.Entity.Message,
        ) ?? [] as Partial<MessageEntity>[],
      artifacts: threadArtifacts as any as ArtifactEntity[],
    };
  },
  
  // Get refresh threads data (without tabs)
  refreshThreadsData: (): RecentThreadRefreshData => {
    return {
      recentThreads: getRecentThreads(),
    };
  },
  
  // Get startup data with recent threads and tabs
  connectedData: (): AgentConnectedData => {
    // Get recent threads and current thread data
    const { threads, currentThread } = getThreadsWithCurrent();

    // Initialize tabs array
    const tabs: Tab[] = [];

    // Find all pinned threads
    const pinnedThreads = qx(EARS.Entity.Thread)
      .where('pinned', true)
      .pick(["id", "shortCode", "topic"] as const) as Partial<ThreadEntity>[];
    const pinnedIds = new Set(pinnedThreads.map(t => t.id));

    // Always add current thread tab
    if (currentThread?.id) {
      const artifacts = getThreadArtifacts(currentThread.id);

      const threadTab: Tab = {
        id: currentThread.id,
        label: currentThread.topic || `Thread ${currentThread.shortCode || ''}`,
        artifacts,
        selectedArtifactId: artifacts[0]?.id,
        ...(pinnedIds.has(currentThread.id) && { pinned: true }),
      };
      tabs.push(threadTab);
    }

    // Add all pinned thread tabs not already shown as current
    for (const pt of pinnedThreads) {
      if (!pt.id || pt.id === currentThread?.id) continue;

      const ptArtifacts = getThreadArtifacts(pt.id);

      tabs.unshift({
        id: pt.id,
        label: pt.topic || 'No topic',
        artifacts: ptArtifacts,
        selectedArtifactId: ptArtifacts[0]?.id,
        pinned: true,
      });
    }

    // Get agent settings
    const allSettings = settingsQueries.getSettings();
    const agentSettings = allSettings?.plugins?.agent;

    return {
      currentThread,
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
    forkable?: boolean;
  }): {
    id: EARS.EntityId;
    threadId: EARS.EntityId;
    text: string;
    sender: string;
    timestamp: number;
  } => {
    const { threadId, text, sender, blocks, forkable } = params;

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

    // Add forkable flag if explicitly set to false
    if (forkable === false) {
      messageTx.put('forkable', forkable);
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