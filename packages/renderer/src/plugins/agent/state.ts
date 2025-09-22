import { assign, log, setup, fromPromise, spawnChild, type ActorRefFrom } from 'xstate';
import type { MessageEntity, ArtifactEntity, ThreadEntity, OutgoingAgentEvents, OutgoingThreadsEvents, AgentThreadData, Tab, ArtifactItem, ArtifactType, AgentSettings, AgentMode as AgentModeConfig } from '@app/api';
import breadcrumb from '@/core/breadcrumb';
import { safeEvents } from '@/core/types/safe-events';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/core/actors/route-trailer';
import { trpc } from '@/core/trpc';
import { application } from '@/core/actors/application';
import { type HotkeyEvent, type HotkeysMap, createHotkeyProcessor } from '@/core/utils/hotkeys';

export const id = 'agent' as const;

export type AgentState = ActorRefFrom<typeof agentState>;

type StatusColor = 'bg-zinc-500' | 'bg-yellow-500' | 'bg-green-500';

// Modes and phases are fully configurable through settings

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
  mode: string; // Current mode
  phase: string; // Current phase (when mode has phases)
  modes: AgentModeConfig[];
  hotkeys: HotkeysMap;
  settings: AgentSettings;
  hasRequiredApiKeys: boolean;
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
  | { type: 'CREATE_CHILD_THREAD'; parentThreadId: string }
  | { type: 'SET_STATUS_COLOR'; color: StatusColor }
  | { type: 'RESET_STATUS_COLOR'; }
  | { type: 'SELECT_TAB'; tabId: string }
  | { type: 'OPEN_THREAD_TAB'; threadId: string; label: string }
  | { type: 'CLOSE_TAB'; tabId: string }
  | { type: 'SELECT_ARTIFACT'; artifactId: string }
  | { type: 'SET_MODE'; mode: string }
  | { type: 'SET_PHASE'; phase: string }
  | { type: 'UPDATE_THREAD_STATUS'; threadId: string; status: ThreadEntity['status'] }
  | { type: 'UPDATE_TODO_TASK'; artifactId: string; taskId: string; completed: boolean }
  | { type: 'APPROVE_TODO_LIST'; artifactId: string; tasks: any[] }
  | { type: 'REJECT_TODO_LIST'; artifactId: string }
  | { type: 'HOTKEY_PRESSED'; } & HotkeyEvent
  | { type: 'TEXT_TO_SPEECH' }
  | { type: 'SWITCH_MODE' }
  | { type: 'NAVIGATE_TO_SECRETS' }
  | { type: 'API_KEYS_STATUS'; hasRequiredApiKeys: boolean }
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
    setPhase: assign(({ event }) => ({
      phase: typeOf('SET_PHASE', event).phase
    })),
    navigateToSecrets: ({ system }) => {
      // Navigate to settings plugin
      system.get(application).send({
        type: 'SELECT_PLUGIN',
        pluginId: 'settings'
      });
      // Navigate to the secrets tab within settings
      const settingsActor = system.get('settings');
      if (settingsActor) {
        settingsActor.send({ type: 'TAB.SELECT', tab: 'general' });
        settingsActor.send({ type: 'GENERAL_NAV.SELECT', item: 'secrets' });
      }
    },
    updateApiKeyStatus: assign(({ event }) => ({
      hasRequiredApiKeys: typeOf('API_KEYS_STATUS', event).hasRequiredApiKeys
    })),
    sendMessage: ({ context, event }) => {
      // Send phase if mode has phases, otherwise send mode
      const currentMode = context.modes.find(m => m.id === context.mode);
      const modeValue = currentMode?.phases?.length ? context.phase : context.mode;

      trpc.bus.send.mutate({
        systemId: id,
        type: 'USER_MSG',
        text: typeOf('SEND_MESSAGE', event).text,
        mode: modeValue,
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
      const thread = typeOf('LOAD_CHAT_THREAD', event).data;

      // Request backend to open tab if thread has artifacts
      if (thread.artifacts?.length && thread.id) {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'OPEN_THREAD_TAB',
          threadId: thread.id,
          label: thread.topic || `Thread ${thread.shortCode || ''}`
        });
      }

      return {
        currentThread: thread,
        ...(thread.forcedMode && { mode: thread.forcedMode })
      };
    }),
    setStartupData: assign(({ context, event }) => {
      const typedEvent = typeOf('AGENT_CONNECTED', event);
      
      // Prioritize current thread tab if it exists and has artifacts
      const currentThreadTab = typedEvent.data.tabs?.find(tab => 
        tab.id === typedEvent.data.currentThread?.id && tab.artifacts.length > 0
      );
      
      const settings = typedEvent.data.settings || { modes: [], hotkeys: {} };
      
      // Extract hotkeys from settings - filter out undefined values  
      const hotkeys: HotkeysMap = {};
      if (settings.hotkeys) {
        Object.entries(settings.hotkeys).forEach(([key, value]) => {
          if (value) {
            hotkeys[key] = value;
          }
        });
      }
      
      // Extract modes from settings or fallback to empty array
      const modes = settings.modes || [];
      
      return {
        currentThread: typedEvent.data.currentThread,
        threads: typedEvent.data.threads as ThreadEntity[],
        tabs: typedEvent.data.tabs || [],
        activeTabId: currentThreadTab?.id || typedEvent.data.tabs?.[0]?.id || 'dashboard',
        hotkeys,
        modes,
        settings,
        hasRequiredApiKeys: typedEvent.data.hasRequiredApiKeys ?? true,
        ...(typedEvent.data.currentThread?.forcedMode && { mode: typedEvent.data.currentThread.forcedMode })
      };
    }),
    
    handleSettingsUpdate: assign(({ event }) => {
      const typedEvent = typeOf('AGENT_SETTINGS_UPDATED', event);
      const settings = typedEvent.settings;
      
      // Extract hotkeys from settings - filter out undefined values  
      const hotkeys: HotkeysMap = {};
      if (settings.hotkeys) {
        Object.entries(settings.hotkeys).forEach(([key, value]) => {
          if (value) {
            hotkeys[key] = value;
          }
        });
      }
      
      // Extract modes from settings or fallback to empty array
      const modes = settings.modes || [];
      
      return {
        hotkeys,
        modes,
        settings,
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
    createChildThread: ({ system, event }) => {
      const parentThreadId = typeOf('CREATE_CHILD_THREAD', event).parentThreadId;
      // Clear current thread and navigate to threads plugin to create child
      system.get('threads').send({ type: 'SHOW_CREATE_FORM_AS_CHILD', parentThreadId });
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
      trpc.bus.send.mutate({
        systemId: id,
        type: 'REFRESH_DASHBOARD'
      });
    },
    updateThreadStatus: async ({ event }) => {
      const { threadId, status } = typeOf('UPDATE_THREAD_STATUS', event);
      trpc.bus.send.mutate({
        systemId: 'threads',
        type: 'UPDATE_THREAD_STATUS',
        threadId,
        status,
      });
    },
    updateTodoTask: assign(({ context, event }) => {
      const { artifactId, taskId, completed } = typeOf('UPDATE_TODO_TASK', event);
      const tabs = context.tabs.map(tab => ({
        ...tab,
        artifacts: tab.artifacts.map(artifact => {
          if (artifact.id === artifactId && artifact.type === 'todo') {
            const tasks = artifact.content.tasks.map((task: any) =>
              task.id === taskId ? { ...task, completed } : task
            );
            return { ...artifact, content: { ...artifact.content, tasks } };
          }
          return artifact;
        })
      }));
      return { tabs };
    }),
    approveTodoList: async ({ event }) => {
      const { artifactId, tasks } = typeOf('APPROVE_TODO_LIST', event);
      // Send approval to backend
      trpc.bus.send.mutate({
        systemId: id,
        type: 'APPROVE_TODO_LIST',
        artifactId,
        tasks
      });
    },
    rejectTodoList: async ({ event }) => {
      const { artifactId } = typeOf('REJECT_TODO_LIST', event);
      // Send rejection to backend
      trpc.bus.send.mutate({
        systemId: id,
        type: 'REJECT_TODO_LIST',
        artifactId
      });
    },
    handleHotkey: createHotkeyProcessor({
      textToSpeech: 'TEXT_TO_SPEECH',
      switchMode: 'SWITCH_MODE'
    }),
    
    textToSpeech: () => {
      // Stub implementation for text-to-speech
      console.log('[Agent] Text-to-speech triggered (stub)');
      // Future implementation will convert last agent message to speech
    },
    
    switchMode: ({ context, self }) => {
      const visibleModes = context.modes.filter(m => !m.hidden);
      if (!visibleModes.length) return;

      const currentIndex = visibleModes.findIndex(m => m.id === context.mode);
      const nextMode = visibleModes[(currentIndex + 1) % visibleModes.length];
      self.send({ type: 'SET_MODE', mode: nextMode.id });
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
    mode: 'work', // Default mode
    phase: 'plan', // Default phase
    modes: [],
    hotkeys: {}, // Will be loaded from settings
    settings: { modes: [], hotkeys: {} }, // Will be loaded from settings
    hasRequiredApiKeys: true, // Default to true, will be updated on AGENT_CONNECTED
  }),
  on: {
    // Hotkey handling
    HOTKEY_PRESSED: {
      actions: ['handleHotkey']
    },
    TEXT_TO_SPEECH: {
      actions: 'textToSpeech'
    },
    SWITCH_MODE: {
      actions: 'switchMode'
    },
    VIEW_THREAD: {
      actions: 'sendOpenThreadView'
    },
    LOAD_CHAT_THREAD: {
      actions: 'setThreadChatData'
    },
    OPEN_THREAD_CHAT: {
      actions: 'requestThreadChatData'
    },
    AGENT_CONNECTED: {
      actions: 'setStartupData'
    },
    AGENT_SETTINGS_UPDATED: {
      actions: 'handleSettingsUpdate'
    },
    NAVIGATE_TO_SECRETS: {
      actions: 'navigateToSecrets'
    },
    API_KEYS_STATUS: {
      actions: 'updateApiKeyStatus'
    },
    REFRESH_RECENT_THREADS: {
      actions: 'setRefreshThreadsData'
    },
    UPDATE_THREAD_STATUS: {
      actions: 'updateThreadStatus'
    },
    UPDATE_TODO_TASK: {
      actions: 'updateTodoTask'
    },
    APPROVE_TODO_LIST: {
      actions: 'approveTodoList'
    },
    REJECT_TODO_LIST: {
      actions: 'rejectTodoList'
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
    SET_PHASE: {
      actions: 'setPhase',
    },
    CLEAR_THREAD: {
      actions: 'clearThread'
    },
    CREATE_CHILD_THREAD: {
      actions: 'createChildThread'
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