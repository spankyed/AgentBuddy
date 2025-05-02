import { assign, createActor, log, setup, fromPromise, spawnChild } from 'xstate';
import type { Message, ActionItem, ContextItem, CanvasContent } from '../helpers/types';
import mockData from './mockData';

// Define the context
interface ApplicationContext {
  activeToolbarItem: string;
  messages: Message[];
  actions: ActionItem[];
  contextItems: ContextItem[];
  canvasContent: CanvasContent;
  isPluginMode: boolean;
  currentThreadId: string | null;
  messageInput: string;
  pendingActionId?: string;
}

// Define the events
type ApplicationEvent =
  | { type: 'SELECT_TOOLBAR_ITEM'; itemId: string }
  | { type: 'SEND_MESSAGE'; content: string }
  | { type: 'ADD_ACTION'; action: ActionItem }
  | { type: 'UPDATE_ACTION'; actionId: string; status: 'pending' | 'in-progress' | 'completed' | 'failed' }
  | { type: 'ADD_CONTEXT_ITEM'; item: ContextItem }
  | { type: 'REMOVE_CONTEXT_ITEM'; itemId: string }
  | { type: 'SET_CANVAS_CONTENT'; content: CanvasContent }
  | { type: 'PROCESS_MESSAGE' }
  | { type: 'TOGGLE_PLUGIN_MODE' }
  | { type: 'SELECT_THREAD'; threadId: string }
  | { type: 'UPDATE_MESSAGE_INPUT'; content: string }
  | { type: 'ADD_ASSISTANT_MESSAGE'; content: string }
  | { type: 'CLEAR_MESSAGES' }

// Define the state machine
export const applicationMachine = setup({
  types: {
    context: {} as ApplicationContext,
    events: {} as ApplicationEvent
  },
  actors: {
    delayedResponse: fromPromise<void, { content: string }>(async ({ input, system }) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      system.get('application').send({ 
        type: 'ADD_ASSISTANT_MESSAGE', 
        content: input.content 
      });
    })
  },
  actions: {
    setActiveToolbarItem: assign({
      activeToolbarItem: ({ event }) => (event.type === 'SELECT_TOOLBAR_ITEM' ? event.itemId : '')
    }),
    addMessage: assign({
      messages: ({ context, event }) => 
        event.type === 'SEND_MESSAGE' 
          ? [...context.messages, { 
              id: Date.now().toString(),
              content: event.content,
              role: 'user' as const,
              timestamp: new Date()
            }]
          : context.messages
    }),
    addAssistantMessage: assign({
      messages: ({ context, event }) => 
        event.type === 'ADD_ASSISTANT_MESSAGE'
          ? [...context.messages, {
              id: Date.now().toString(),
              content: event.content,
              role: 'assistant' as const,
              timestamp: new Date()
            }]
          : context.messages
    }),
    addAction: assign({
      actions: ({ context, event }) => 
        event.type === 'ADD_ACTION' 
          ? [...context.actions, event.action]
          : context.actions
    }),
    updateAction: assign({
      actions: ({ context, event }) => 
        event.type === 'UPDATE_ACTION'
          ? context.actions.map(action => 
              action.id === event.actionId 
                ? { ...action, status: event.status }
                : action
            )
          : context.actions
    }),
    addContextItem: assign({
      contextItems: ({ context, event }) => 
        event.type === 'ADD_CONTEXT_ITEM'
          ? [...context.contextItems, event.item]
          : context.contextItems
    }),
    removeContextItem: assign({
      contextItems: ({ context, event }) =>
        event.type === 'REMOVE_CONTEXT_ITEM'
          ? context.contextItems.filter(item => item.id !== event.itemId)
          : context.contextItems
    }),
    updateCanvasContent: assign({
      canvasContent: ({ event }) => 
        event.type === 'SET_CANVAS_CONTENT'
          ? event.content
          : { id: '1', type: 'text' as const, content: '' }
    }),
    togglePluginMode: assign({
      isPluginMode: ({ context }) => !context.isPluginMode
    }),
    setCurrentThread: assign({
      currentThreadId: ({ event }) => 
        event.type === 'SELECT_THREAD'
          ? event.threadId
          : null
    }),
    updateMessageInput: assign({
      messageInput: ({ event }) => 
        event.type === 'UPDATE_MESSAGE_INPUT'
          ? event.content
          : ''
    }),
    setPendingActionId: assign({
      pendingActionId: (context) => {
        const newAction: ActionItem = {
          id: Date.now().toString(),
          description: 'Processing your request...',
          status: 'in-progress',
          timestamp: new Date()
        }
        return newAction.id
      }
    }),
    clearMessages: assign({
      messages: []
    })
  }
}).createMachine({
  id: 'application',
  context: {
    activeToolbarItem: 'code',
    messages: mockData.messages,
    actions: mockData.actions,
    contextItems: mockData.contextItems,
    canvasContent: mockData.canvasContent,
    isPluginMode: false,
    currentThreadId: null,
    messageInput: '',
    pendingActionId: undefined
  },
  on: {
    SELECT_TOOLBAR_ITEM: {
      actions: 'setActiveToolbarItem'
    },
    CLEAR_MESSAGES: {
      actions: 'clearMessages'
    },
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
    ADD_ACTION: {
      actions: 'addAction'
    },
    UPDATE_ACTION: {
      actions: 'updateAction'
    },
    ADD_CONTEXT_ITEM: {
      actions: 'addContextItem'
    },
    REMOVE_CONTEXT_ITEM: {
      actions: 'removeContextItem'
    },
    SET_CANVAS_CONTENT: {
      actions: 'updateCanvasContent'
    },

    TOGGLE_PLUGIN_MODE: {
      actions: 'togglePluginMode'
    },
    SELECT_THREAD: {
      actions: 'setCurrentThread'
    },
    UPDATE_MESSAGE_INPUT: {
      actions: 'updateMessageInput'
    },
    ADD_ASSISTANT_MESSAGE: {
      actions: 'addAssistantMessage'
    }
  }
});

export const applicationActor = createActor(applicationMachine, {
  systemId: 'application',
  // inspect: (inspEvent) => {
  //   console.log(inspEvent); // the event that caused the transition
  // }
}).start();

applicationActor.subscribe({
  // Subscribe to events
  // next: (state) => {
  //   console.log('---', {state});
  // },
  // Subscribe to errors
  error: (error) => {
    console.error('Application State Error:', error);
  }
});