import { assign, log, setup, fromPromise, spawnChild } from 'xstate';
import type { Message, ActionItem, ContextItem, CanvasContent } from '@/helpers/types';
// import { typeOf } from '@/helpers/types/typed-ev';
import mockData from '@/state/mockData';

export const id = 'agent';

export interface AgentContext {
  messages: Message[];
  actions: ActionItem[];
  contextItems: ContextItem[];
  canvasContent: CanvasContent;
  currentThreadId: string | null;
  messageInput: string;
  pendingActionId?: string;
}

export type AgentEvent =
  | { type: 'SEND_MESSAGE'; content: string }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'SELECT_THREAD'; threadId: string }
  // | { type: 'ADD_ACTION'; action: ActionItem }
  // | { type: 'UPDATE_ACTION'; actionId: string; status: 'pending' | 'in-progress' | 'completed' | 'failed' }
  // | { type: 'UPDATE_MESSAGE_INPUT'; content: string }
  | { type: 'ADD_ASSISTANT_MESSAGE'; content: string }

const blankState = setup({
  actors: {
    delayedResponse: fromPromise<void, { content: string }>(async ({ input, system }) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      system.get(id).send({ 
        type: 'ADD_ASSISTANT_MESSAGE', 
        content: input.content 
      });
    })
  },
    actions: {
      addMessage: assign(({ context, event }) => ({
        messages: [...context.messages, { 
          id: Date.now().toString(),
          content: event.content,
          // content: typeOf('SEND_MESSAGE', event).content,
          role: 'user' as const,
          timestamp: new Date()
        }]
      })),
      addAssistantMessage: assign(({ context, event }) => ({
        messages: [...context.messages, {
          id: Date.now().toString(),
          content: event.content,
          // content: typeOf('ADD_ASSISTANT_MESSAGE', event).content,
          role: 'assistant' as const,
          timestamp: new Date(),
        }]
      })),
      addAction: assign(({ context, event }) => ({
        actions: [...context.actions, event.action]
        // actions: [...context.actions, typeOf('ADD_ACTION', event).action]
      })),
      updateAction: assign(({ context, event }) => {
        const typedEvent = event;
        // const typedEvent = typeOf('UPDATE_ACTION', event);
        return {
          // biome-ignore lint/suspicious/noExplicitAny: <explanation>
          actions: context.actions.map((action: any) => 
            action.id === typedEvent.actionId 
              ? { ...action, status: typedEvent.status }
              : action
          )
        }
      }),
      setCurrentThread: assign(({ event }) => ({
        currentThreadId: event.threadId
        // currentThreadId: typeOf('SELECT_THREAD', event).threadId
      })),
      updateMessageInput: assign(({ event }) => ({
        messageInput: event.content
        // messageInput: typeOf('UPDATE_MESSAGE_INPUT', event).content
      })),
      setPendingActionId: assign(() => {
        const newAction: ActionItem = {
          id: Date.now().toString(),
          description: 'Processing your request...',
          status: 'in-progress',
          timestamp: new Date()
        }
        return { pendingActionId: newAction.id }
      }),
      clearMessages: assign(() => ({
        messages: []
      }))
    }
}).createMachine({
  id,
  context: ({ input }) => ({
    messages: mockData.messages,
    actions: mockData.actions,
    contextItems: mockData.contextItems,
    canvasContent: mockData.canvasContent,
    currentThreadId: null,
    messageInput: "",
    pendingActionId: undefined,
  }),
  states: {},
  on: {
    SEND_MESSAGE: {
      actions: [
        'addMessage',
        spawnChild('delayedResponse', {
          input: {
            content: "I'm analyzing your request to rewrite the code with CSS variables. Give me a moment to prepare a response."
          }
        }),
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
    // UPDATE_MESSAGE_INPUT: {
    //   actions: 'updateMessageInput'
    // },
    // ADD_ACTION: {
    //   actions: 'addAction'
    // },
    // UPDATE_ACTION: {
    //   actions: 'updateAction'
    // },
    // ADD_CONTEXT_ITEM: {
    //   actions: 'addContextItem'
    // },
    // REMOVE_CONTEXT_ITEM: {
    //   actions: 'removeContextItem'
    // },
  }
}); 

export default blankState;