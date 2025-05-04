import { assign, createActor, log, setup, fromPromise, spawnChild } from 'xstate';
import type { Message, ActionItem, Plugin } from '../helpers/types';
import mockData from './mockData';
import { typeOf } from '../helpers/types/typed-ev';
import plugins, { defaultPlugin } from '../plugins/index';

export interface ApplicationParams {
  plugins: Plugin[];
  defaultPlugin: Plugin;
}

export interface ApplicationContext {
  agentToggles: {
    canvas: boolean;
    panel: boolean;
  },
  activePlugin: Plugin;
  defaultPlugin: Plugin;
  plugins: Plugin[];
  messages: Message[];
  actions: ActionItem[];
  currentThreadId: string | null;
  messageInput: string;
  pendingActionId?: string;
}

export type ApplicationEvent =
  | { type: 'SELECT_PLUGIN'; pluginId: string }
  | { type: 'SEND_MESSAGE'; content: string }
  | { type: 'ADD_ACTION'; action: ActionItem }
  | { type: 'UPDATE_ACTION'; actionId: string; status: 'pending' | 'in-progress' | 'completed' | 'failed' }
  | { type: 'PROCESS_MESSAGE' }
  | { type: 'TOGGLE_CANVAS_AGENT' }
  | { type: 'TOGGLE_PANEL_AGENT' }
  | { type: 'SELECT_THREAD'; threadId: string }
  | { type: 'UPDATE_MESSAGE_INPUT'; content: string }
  | { type: 'ADD_ASSISTANT_MESSAGE'; content: string }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'CANVAS_TOGGLE' }
  | { type: 'PANEL_TOGGLE' }

  export const applicationMachine = setup({
  types: {
    context: {} as ApplicationContext,
    events: {} as ApplicationEvent,
    input: {} as ApplicationParams,
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
    setActivePlugin: assign(({ context, event }) => ({
      activePlugin: context.plugins.find(p => p.id === typeOf('SELECT_PLUGIN', event).pluginId) || context.activePlugin
    })),
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
        timestamp: new Date()
      }]
    })),
    addAction: assign(({ context, event }) => ({
      actions: [...context.actions, typeOf('ADD_ACTION', event).action]
    })),
    updateAction: assign(({ context, event }) => {
      const typedEvent = typeOf('UPDATE_ACTION', event);
      return {
        actions: context.actions.map(action => 
          action.id === typedEvent.actionId 
            ? { ...action, status: typedEvent.status }
            : action
        )
      }
    }),
    handleAgentToggle: assign(({ context }, params: 'canvas' | 'panel') => ({
      agentToggles: {
        ...context.agentToggles,
        [params]: !context.agentToggles[params]
      }
    })),
    setCurrentThread: assign(({ event }) => ({
      currentThreadId: typeOf('SELECT_THREAD', event).threadId
    })),
    updateMessageInput: assign(({ event }) => ({
      messageInput: typeOf('UPDATE_MESSAGE_INPUT', event).content
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
  context: ({ input }) => ({
    agentToggles: {
      canvas: false,
      panel: false,
    },
    defaultPlugin: input.defaultPlugin,
    activePlugin: input.plugins[0],
    plugins: input.plugins,
    messages: mockData.messages,
    actions: mockData.actions,
    currentThreadId: null,
    messageInput: "",
    pendingActionId: undefined,
  }),
  on: {
    SELECT_PLUGIN: {
      actions: 'setActivePlugin'
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
    CANVAS_TOGGLE: {
      actions: {
        type: 'handleAgentToggle',
        params: 'canvas'
      }
    },
    PANEL_TOGGLE: {
      actions: {
        type: 'handleAgentToggle',
        params: 'panel'
      }
    },
    SELECT_THREAD: {
      actions: 'setCurrentThread'
    },
    UPDATE_MESSAGE_INPUT: {
      actions: 'updateMessageInput'
    },
    ADD_ASSISTANT_MESSAGE: {
      actions: 'addAssistantMessage'
    },
  }
});

export const applicationActor = createActor(applicationMachine, {
  systemId: 'application',
  input: {
    defaultPlugin,
    plugins,
  }
}).start();

applicationActor.subscribe({
  error: (error) => {
    console.error('Application State Error:', error);
  }
});

declare global {
  interface Window {
    applicationActor: typeof applicationActor;
  }
}

window.applicationActor = applicationActor;