import { assign, log, setup, fromPromise, spawnChild, type ActorRefFrom } from 'xstate';
import type { MessageEntity, ContextItemEntity, CanvasContentEntity, ThreadEntity, OutgoingAgentEvents, StartupData, AgentThreadData } from '@abuddy/api';
import breadcrumb from '@/core/breadcrumb';
import { safeEvents } from '@/core/types/safe-events';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/core/actors/route-trailer';
import { trpc } from '@/core/trpc';

export const id = 'agent' as const;

export type AgentState = ActorRefFrom<typeof agentState>;

type StatusColor = 'bg-zinc-500' | 'bg-yellow-500' | 'bg-green-500';

interface AgentContext {
  currentThread: AgentThreadData | null;
  threads: Partial<ThreadEntity>[];
  messageInput: string;
  pendingActionId?: string;
  statusColor: StatusColor;
}

type AgentEvent =
  | { type: 'OPEN_THREAD_CHAT'; threadId: string }
  | { type: 'VIEW_WORKLOAD'; }
  | { type: 'SEND_MESSAGE'; text: string }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'SET_STATUS_COLOR'; color: StatusColor }
  | { type: 'RESET_STATUS_COLOR'; }
  // | { type: 'UPDATE_MESSAGE_INPUT'; text: string }
  | { type: 'STARTUP'; pluginData: StartupData[typeof id] }
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
    setStatusColor: assign((_, params?: { color: StatusColor}) => {
      if (params?.color) {
        return { statusColor: params.color };
      }
      return { statusColor: 'bg-zinc-500' as StatusColor };
    }),
    sendMessage: ({ event }) => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'USER_MSG',
        text: typeOf('SEND_MESSAGE', event).text,
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
    clearMessages: assign(({ context }) => ({
      currentThread: {
        ...context.currentThread!,
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
    setPluginData: assign(({ event }) => {
      const typedEvent = typeOf('STARTUP', event);
      console.log('typedEvent.pluginData.threads', typedEvent.pluginData);
      return {
        currentThread: typedEvent.pluginData.currentThread,
        threads: typedEvent.pluginData.threads as ThreadEntity[],
      };
    }),
  },
  guards: {
    targetIs,
  }
}).createMachine({
  id,
  initial: 'canvas',
  context: ({ input }) => ({
    currentThread: {
      id: `Thread-${Date.now()}`,
      shortCode: '',
      topic: '',
      instructions: '',
      status: 'draft',
      timestamp: Date.now(),
      messages: [],
      contextItems: [],
      canvasContent: { 
        id: 'CanvasItem-0', 
        entityType: 'CanvasItem', 
        contentType: 'text', 
        content: 'Waiting for data...', 
        createdAt: Date.now() 
      } as CanvasContentEntity,
    } as AgentThreadData,
    threads: [],
    messageInput: "",
    pendingActionId: undefined,
    statusColor: 'bg-zinc-500' as StatusColor,
  }),
  on: {
    OPEN_THREAD_CHAT: {
      actions: 'requestThreadChatData'
    },
    STARTUP: {
      actions: 'setPluginData'
    },
    ...TRAIL_CLICK([
      ['.canvas', 'canvas'],
      ['.workload', 'workload'],
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
    CLEAR_MESSAGES: {
      actions: 'clearMessages'
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
      on: {
        VIEW_WORKLOAD: {
          target: 'workload',
        },
      }
    },
    'workload': {
      meta: { ...breadcrumb('workload', 'Workload') },
    }
  },
}); 

export default agentState;