import { assign, log, setup, fromPromise, spawnChild, type ActorRefFrom } from 'xstate';
import type { MessageEntity, ContextItemEntity, CanvasContentEntity, ThreadEntity, OutgoingAgentEvents, StartupData } from '@abuddy/api';
import breadcrumb from '@/core/breadcrumb';
import { safeEvents } from '@/core/types/safe-events';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/core/actors/route-trailer';
import { trpc } from '@/core/trpc';

export const id = 'agent' as const;

export type AgentState = ActorRefFrom<typeof agentState>;

type StatusColor = 'bg-zinc-500' | 'bg-yellow-500' | 'bg-green-500';

interface AgentContext {
  messages: MessageEntity[];
  contextItems: ContextItemEntity[];
  canvasContent: CanvasContentEntity;
  threads: ThreadEntity[];
  currentThreadId: string | null;
  messageInput: string;
  pendingActionId?: string;
  statusColor: StatusColor;
}

type AgentEvent =
  | { type: 'VIEW_WORKLOAD'; }
  | { type: 'SEND_MESSAGE'; content: string }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'SELECT_THREAD'; threadId: string }
  | { type: 'SET_STATUS_COLOR'; color: StatusColor }
  | { type: 'RESET_STATUS_COLOR'; }
  // | { type: 'UPDATE_MESSAGE_INPUT'; content: string }
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
        content: typeOf('SEND_MESSAGE', event).content,
      });
    },
    addMessage: assign(({ context, event }) => ({
      messages: [...context.messages, { 
        id: Date.now().toString(),
        entityType: 'Message' as const,
        createdAt: Date.now(),
        content: typeOf('SEND_MESSAGE', event).content,
        sender: 'user' as const,
        timestamp: Date.now()
      } as MessageEntity]
    })),
    addAssistantMessage: assign(({ context, event }) => ({
      messages: [...context.messages, {
        id: Date.now().toString(),
        entityType: 'Message' as const,
        createdAt: Date.now(),
        content: typeOf('ADD_ASSISTANT_MESSAGE', event).content,
        sender: 'assistant' as const,
        timestamp: Date.now(),
      } as MessageEntity]
    })),
    setCurrentThread: assign(({ event }) => ({
      currentThreadId: typeOf('SELECT_THREAD', event).threadId
    })),
    clearMessages: assign(() => ({
      messages: []
    })),
    setPluginData: assign(({ event }) => {
      const typedEvent = typeOf('STARTUP', event);
      console.log('typedEvent: ', typedEvent);
      
      // Filter entities by their respective types
      return {
        messages: typedEvent.pluginData.messages,
        contextItems: typedEvent.pluginData.contextItems,
        canvasContent: typedEvent.pluginData.canvasContent,
        threads: typedEvent.pluginData.threads,
      };
    }),
    handleTokenStream: assign(({ context, event }) => {
      const token = typeOf('TOKEN_STREAM', event).token;
      const { messages, pendingActionId } = context;
      if (pendingActionId) {
        return {
          messages: messages.map(m => m.id === pendingActionId ? { ...m, content: m.content + token } : m),
        };
      }

      const newId = Date.now().toString();
      return {
        messages: [...messages, {
          id: newId,
          entityType: 'Message' as const,
          content: token,
          sender: 'assistant' as const,
          timestamp: Date.now(),
          createdAt: Date.now()
        } as MessageEntity],
        pendingActionId: newId,
      };
    }),
    finishStream: assign(({ context }) => ({
      pendingActionId: undefined,
    })),
    // updateMessageInput: assign(({ event }) => ({
    //   messageInput: typeOf('UPDATE_MESSAGE_INPUT', event).content
    // })),
  },
  guards: {
    targetIs,
  }
}).createMachine({
  id,
  initial: 'canvas',
  context: ({ input }) => ({
    messages: [],
    contextItems: [],
    canvasContent: { 
      id: '0', 
      entityType: 'CanvasItem', 
      contentType: 'text', 
      content: 'Waiting for data...', 
      createdAt: Date.now() 
    } as CanvasContentEntity,
    threads: [],
    currentThreadId: null,
    messageInput: "",
    pendingActionId: undefined,
    statusColor: 'bg-zinc-500' as StatusColor,
  }),
  on: {
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
    SELECT_THREAD: {
      actions: 'setCurrentThread'
    },
    STARTUP: {
      actions: 'setPluginData'
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