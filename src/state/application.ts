import { assign, createActor, log, setup, fromPromise, spawnChild } from 'xstate';
import type { Message, ActionItem, ContextItem, CanvasContent } from '../helpers/types';
import mockData from './mockData';
import eventOf from '../helpers/types/typed-ev';

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
export type ApplicationEvent =
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
    setActiveToolbarItem: assign(({ event }) => ({
      activeToolbarItem: eventOf('SELECT_TOOLBAR_ITEM', event).itemId
    })),
    addMessage: assign(({ context, event }) => ({
      messages: [...context.messages, { 
        id: Date.now().toString(),
        content: eventOf('SEND_MESSAGE', event).content,
        role: 'user' as const,
        timestamp: new Date()
      }]
    })),
    addAssistantMessage: assign(({ context, event }) => ({
      messages: [...context.messages, {
        id: Date.now().toString(),
        content: eventOf('ADD_ASSISTANT_MESSAGE', event).content,
        role: 'assistant' as const,
        timestamp: new Date()
      }]
    })),
    addAction: assign(({ context, event }) => ({
      actions: [...context.actions, eventOf('ADD_ACTION', event).action]
    })),
    updateAction: assign(({ context, event }) => {
      const typedEvent = eventOf('UPDATE_ACTION', event);
      return {
        actions: context.actions.map(action => 
          action.id === typedEvent.actionId 
            ? { ...action, status: typedEvent.status }
            : action
        )
      }
    }),
    addContextItem: assign(({ context, event }) => ({
      contextItems: [...context.contextItems, eventOf('ADD_CONTEXT_ITEM', event).item]
    })),
    removeContextItem: assign(({ context, event }) => ({
      contextItems: context.contextItems.filter(item => item.id !== eventOf('REMOVE_CONTEXT_ITEM', event).itemId)
    })),
    updateCanvasContent: assign(({ event }) => ({
      canvasContent: eventOf('SET_CANVAS_CONTENT', event).content
    })),
    togglePluginMode: assign(({ context }) => ({
      isPluginMode: !context.isPluginMode
    })),
    setCurrentThread: assign(({ event }) => ({
      currentThreadId: eventOf('SELECT_THREAD', event).threadId
    })),
    updateMessageInput: assign(({ event }) => ({
      messageInput: eventOf('UPDATE_MESSAGE_INPUT', event).content
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