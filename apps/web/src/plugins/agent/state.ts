import { assign, log, setup, fromPromise, spawnChild, type ActorRefFrom } from 'xstate';
import type { Message, ContextItem, CanvasContent } from '@abuddy/api';
import breadcrumb from '@/core/breadcrumb';
import { safeEvents } from '@/core/types/safe-events';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/core/actors/route-trailer';
import { trpc } from '@/core/trpc';

export const id = 'agent' as const;

export type AgentState = ActorRefFrom<typeof agentState>;

interface AgentContext {
  messages: Message[];
  contextItems: ContextItem[];
  canvasContent: CanvasContent;
  threads: { id: string; title: string; timestamp: Date }[];
  currentThreadId: string | null;
  messageInput: string;
  pendingActionId?: string;
}

type AgentEvent =
  | { type: 'VIEW_WORKLOAD'; }
  | { type: 'SEND_MESSAGE'; content: string }
  | { type: 'ADD_ASSISTANT_MESSAGE'; content: string }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'SELECT_THREAD'; threadId: string }
  | { type: 'WAKEUP'; pluginData: { messages: Message[], contextItems: ContextItem[], canvasContent: CanvasContent, threads: { id: string; title: string; timestamp: Date }[] } }
  // | { type: 'UPDATE_MESSAGE_INPUT'; content: string }
  | TrailClickEvent;

const typeOf = safeEvents<AgentEvent>();
  
const agentState = setup({
  types: { context: {} as AgentContext, events: {} as AgentEvent },
  actors: {
    // delayedResponse: fromPromise<void, { content: string }>(async ({ input, system }) => {
    //   await new Promise(resolve => setTimeout(resolve, 1000));
    //   system.get(id).send({ 
    //     type: 'ADD_ASSISTANT_MESSAGE', 
    //     content: input.content 
    //   });
    // })
  },
  actions: {
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
        content: typeOf('SEND_MESSAGE', event).content,
        role: 'user' as const,
        timestamp: new Date()
      }]
    })),
    addAssistantMessage: assign(({ context, event }) => ({
      messages: [...context.messages, {
        id: Date.now().toString(),
        content: typeOf('ADD_ASSISTANT_MESSAGE', event).content,
        role: 'assistant' as const,
        timestamp: new Date(),
      }]
    })),
    setCurrentThread: assign(({ event }) => ({
      currentThreadId: typeOf('SELECT_THREAD', event).threadId
    })),
    clearMessages: assign(() => ({
      messages: []
    })),
    setPluginData: assign(({ event }) => {
      const typedEvent = typeOf('WAKEUP', event);
      console.log('typedEvent: ', typedEvent);
      return {
        messages: typedEvent.pluginData.messages,
        contextItems: typedEvent.pluginData.contextItems,
        canvasContent: typedEvent.pluginData.canvasContent,
        threads: typedEvent.pluginData.threads
      };
    }),
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
    canvasContent: { id: '0', type: 'text', content: 'Waiting for data...' },
    threads: [],
    currentThreadId: null,
    messageInput: "",
    pendingActionId: undefined,
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
      ],
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
    WAKEUP: {
      actions: 'setPluginData'
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