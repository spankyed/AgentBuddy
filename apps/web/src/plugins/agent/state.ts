import { assign, log, setup, fromPromise, spawnChild, type ActorRefFrom } from 'xstate';
import type { MessageEntity, ArtifactEntity, ThreadEntity, OutgoingAgentEvents, AgentThreadData, Tab, ArtifactItem, ArtifactType } from '@abuddy/api';
import breadcrumb from '@/core/breadcrumb';
import { safeEvents } from '@/core/types/safe-events';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/core/actors/route-trailer';
import { trpc } from '@/core/trpc';
import { application } from '@/core/actors/application';

export const id = 'agent' as const;

export type AgentState = ActorRefFrom<typeof agentState>;

type StatusColor = 'bg-zinc-500' | 'bg-yellow-500' | 'bg-green-500';

type AgentMode = 'plan' | 'work' | 'chat' | 'note';

const defaultThread: AgentThreadData = {
  id: undefined,
  shortCode: '',
  topic: '',
  instructions: '',
  status: 'backlog',
  timestamp: Date.now(),
  messages: [],
  artifacts: [],
};

interface AgentContext {
  currentThread: AgentThreadData | null;
  threads: Partial<ThreadEntity>[];
  messageInput: string;
  pendingActionId?: string;
  statusColor: StatusColor;
  tabs: Tab[];
  activeTabId: string;
  mode: AgentMode;
}

type Brain_FE_AgentEvents =
  | { type: 'ADD_ASSISTANT_MESSAGE'; text: string }
  | { type: 'TOKEN_STREAM'; token: string }
  | { type: 'LLM_DONE' }

type AgentEvent =
  | { type: 'OPEN_THREAD_CHAT'; threadId: string }
  | { type: 'VIEW_THREAD'; threadId: string }
  | { type: 'SEND_MESSAGE'; text: string }
  | { type: 'CLEAR_THREAD' }
  | { type: 'SET_STATUS_COLOR'; color: StatusColor }
  | { type: 'RESET_STATUS_COLOR'; }
  | { type: 'SELECT_TAB'; tabId: string }
  | { type: 'OPEN_THREAD_TAB'; threadId: string; label: string }
  | { type: 'CLOSE_TAB'; tabId: string }
  | { type: 'SELECT_ARTIFACT'; artifactId: string }
  | { type: 'SET_MODE'; mode: AgentMode }
  // | { type: 'UPDATE_MESSAGE_INPUT'; text: string }
  | Brain_FE_AgentEvents
  | OutgoingAgentEvents
  | TrailClickEvent;

const typeOf = safeEvents<AgentEvent>();

const agentState = setup({
  types: { context: {} as AgentContext, events: {} as AgentEvent },
  actors: {
    resetStatusColorAfterDelay: fromPromise<void, void>(async ({ system }) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      system.get(id).send({ type: 'RESET_STATUS_COLOR' });
    })
  },
  actions: {
    requestThreadChatData: ({ event }) => {
      const threadId = typeOf('OPEN_THREAD_CHAT', event).threadId;
      trpc.bus.send.mutate({
        systemId: id,
        type: 'OPEN_THREAD_CHAT',
        threadId,
      });
    },
    setStatusColor: assign((_, params?: { color: StatusColor }) => {
      if (params?.color) {
        return { statusColor: params.color };
      }
      return { statusColor: 'bg-zinc-500' as StatusColor };
    }),
    setMode: assign(({ event }) => ({
      mode: typeOf('SET_MODE', event).mode
    })),
    sendMessage: ({ context, event }) => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'USER_MSG',
        text: typeOf('SEND_MESSAGE', event).text,
        mode: context.mode,
        threadId: context.currentThread?.id,
      });
    },
    addMessage: assign(({ context, event }) => ({
      currentThread: {
        ...context.currentThread!,
        messages: [...(context.currentThread?.messages || []), {
          id: Date.now().toString(),
          entityType: 'Message' as const,
          createdAt: Date.now(),
          text: typeOf('SEND_MESSAGE', event).text,
          sender: 'user' as const,
          timestamp: Date.now()
        } as MessageEntity]
      }
    })),
    addAssistantMessage: assign(({ context, event }) => ({
      currentThread: {
        ...context.currentThread!,
        messages: [...(context.currentThread?.messages || []), {
          id: Date.now().toString(),
          entityType: 'Message' as const,
          createdAt: Date.now(),
          text: typeOf('ADD_ASSISTANT_MESSAGE', event).text,
          sender: 'assistant' as const,
          timestamp: Date.now(),
        } as MessageEntity]
      }
    })),
    clearThread: assign(() => ({
      currentThread: {
        ...defaultThread,
        messages: []
      }
    })),

    handleTokenStream: assign(({ context, event }) => {
      const token = typeOf('TOKEN_STREAM', event).token;
      const { currentThread, pendingActionId } = context;
      const messages = currentThread?.messages || [];

      if (pendingActionId) {
        return {
          currentThread: {
            ...currentThread!,
            messages: messages.map(m => m.id === pendingActionId ? { ...m, text: m.text + token } : m),
          }
        };
      }

      const newId = Date.now().toString();
      return {
        currentThread: {
          ...currentThread!,
          messages: [...messages, {
            id: newId,
            entityType: 'Message' as const,
            text: token,
            sender: 'assistant' as const,
            timestamp: Date.now(),
            createdAt: Date.now()
          } as MessageEntity]
        },
        pendingActionId: newId,
      };
    }),
    finishStream: assign(({ context }) => ({
      pendingActionId: undefined,
    })),
    // updateMessageInput: assign(({ event }) => ({
    //   messageInput: typeOf('UPDATE_MESSAGE_INPUT', event).text
    // })),
    setThreadChatData: assign(({ event }) => {
      const typedEvent = typeOf('LOAD_CHAT_THREAD', event);
      return {
        currentThread: typedEvent.data,
      };
    }),
    setStartupData: assign(({ context, event }) => {
      const typedEvent = typeOf('AGENT_STARTUP', event);
      
      // Prioritize current thread tab if it exists and has artifacts
      const currentThreadTab = typedEvent.data.tabs?.find(tab => 
        tab.id === typedEvent.data.currentThread?.id && tab.artifacts.length > 0
      );
      
      return {
        currentThread: typedEvent.data.currentThread,
        threads: typedEvent.data.threads as ThreadEntity[],
        tabs: typedEvent.data.tabs || [],
        activeTabId: currentThreadTab?.id || typedEvent.data.tabs?.[0]?.id || 'dashboard',
      };
    }),
    setRefreshThreadsData: assign(({ context, event }) => {
      const typedEvent = typeOf('REFRESH_RECENT_THREADS', event);
      
      return {
        currentThread: typedEvent.data.currentThread,
        threads: typedEvent.data.threads as ThreadEntity[],
      };
    }),
    sendOpenThreadView: ({ system, event }) => {
      const threadId = typeOf('VIEW_THREAD', event).threadId;
      system.get('threads').send({ type: 'SELECT_THREAD', id: threadId });
      system.get(application).send({ type: 'SELECT_PLUGIN', pluginId: 'threads' });
    },
    selectTab: assign(({ event }) => ({
      activeTabId: typeOf('SELECT_TAB', event).tabId
    })),
    openThreadTab: assign(({ context, event }) => {
      const { threadId, label } = typeOf('OPEN_THREAD_TAB', event);
      const existingTab = context.tabs.find(t => t.id === threadId);

      if (existingTab) {
        return { activeTabId: threadId };
      }

      return {
        tabs: [...context.tabs, {
          id: threadId,
          label,
          artifacts: [],
          selectedArtifactId: undefined
        }],
        activeTabId: threadId
      };
    }),
    closeTab: assign(({ context, event }) => {
      const tabId = typeOf('CLOSE_TAB', event).tabId;
      if (tabId === 'dashboard') return {}; // Can't close dashboard

      const newTabs = context.tabs.filter(t => t.id !== tabId);
      const newActiveTabId = context.activeTabId === tabId ? 'dashboard' : context.activeTabId;

      return {
        tabs: newTabs,
        activeTabId: newActiveTabId
      };
    }),
    selectArtifact: assign(({ context, event }) => {
      const artifactId = typeOf('SELECT_ARTIFACT', event).artifactId;
      const tabs = context.tabs.map(tab =>
        tab.id === context.activeTabId
          ? { ...tab, selectedArtifactId: artifactId }
          : tab
      );
      return { tabs };
    }),
    addArtifact: assign(({ context, event }) => {
      const { tabId, artifact } = typeOf('ARTIFACT_ADDED', event);
      const tabs = context.tabs.map(tab =>
        tab.id === tabId
          ? { ...tab, artifacts: [...tab.artifacts, artifact] }
          : tab
      );
      return { tabs };
    }),
    requestDashboardRefresh: async () => {
      // Request fresh data from backend
      await trpc.bus.send.mutate({
        systemId: id,
        type: 'REFRESH_DASHBOARD'
      });
    },
  },
  guards: {
    targetIs,
  }
}).createMachine({
  id,
  initial: 'canvas',
  context: ({ input }) => ({
    currentThread: defaultThread,
    threads: [],
    messageInput: "",
    pendingActionId: undefined,
    statusColor: 'bg-zinc-500' as StatusColor,
    tabs: [],
    activeTabId: 'dashboard',
    mode: 'chat' as AgentMode,
  }),
  on: {
    VIEW_THREAD: {
      actions: 'sendOpenThreadView'
    },
    LOAD_CHAT_THREAD: {
      actions: 'setThreadChatData'
    },
    OPEN_THREAD_CHAT: {
      actions: 'requestThreadChatData'
    },
    AGENT_STARTUP: {
      actions: 'setStartupData'
    },
    REFRESH_RECENT_THREADS: {
      actions: 'setRefreshThreadsData'
    },
    THREAD_STATUS_UPDATED: {
      actions: 'requestDashboardRefresh'
    },
    ...TRAIL_CLICK([
      ['.canvas', 'canvas'],
    ]),
    SEND_MESSAGE: {
      actions: [
        'addMessage',
        'sendMessage',
        { type: 'setStatusColor', params: { color: 'bg-yellow-500' } },
      ],
    },
    RESET_STATUS_COLOR: {
      actions: 'setStatusColor',
    },
    SET_MODE: {
      actions: 'setMode',
    },
    CLEAR_THREAD: {
      actions: 'clearThread'
    },
    ADD_ASSISTANT_MESSAGE: {
      actions: 'addAssistantMessage'
    },
    TOKEN_STREAM: {
      actions: 'handleTokenStream'
    },
    LLM_DONE: {
      actions: [
        'finishStream',
        { type: 'setStatusColor', params: { color: 'bg-green-500' } },
        spawnChild('resetStatusColorAfterDelay'),
      ]
    },
    SELECT_TAB: {
      actions: 'selectTab'
    },
    OPEN_THREAD_TAB: {
      actions: 'openThreadTab'
    },
    CLOSE_TAB: {
      actions: 'closeTab'
    },
    SELECT_ARTIFACT: {
      actions: 'selectArtifact'
    },
    ARTIFACT_ADDED: {
      actions: 'addArtifact'
    },
    THREAD_TAB_REQUESTED: {
      actions: assign(({ context, event }) => {
        const { threadId, artifacts } = typeOf('THREAD_TAB_REQUESTED', event);

        // Find thread to get label
        const thread = context.threads.find(t => t.id === threadId);
        const label = thread?.topic || `Thread ${threadId}`;

        // Check if tab already exists
        const existingTab = context.tabs.find(t => t.id === threadId);

        if (existingTab) {
          // Update artifacts for existing tab
          return {
            tabs: context.tabs.map(tab =>
              tab.id === threadId
                ? { ...tab, artifacts }
                : tab
            ),
            activeTabId: threadId
          };
        }

        // Create new tab with artifacts
        return {
          tabs: [...context.tabs, {
            id: threadId,
            label,
            artifacts,
            selectedArtifactId: artifacts[0]?.id
          }],
          activeTabId: threadId
        };
      })
    },
    // UPDATE_MESSAGE_INPUT: {
    //   actions: 'updateMessageInput'
    // },
    // ADD_CONTEXT_ITEM: {
    //   actions: 'addContextItem'
    // },
    // REMOVE_CONTEXT_ITEM: {
    //   actions: 'removeContextItem'
    // },
  },
  states: {
    'canvas': {
      meta: { ...breadcrumb('canvas', 'Agent', true) },
    },
  },
});

export default agentState;