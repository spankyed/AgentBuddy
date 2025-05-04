import { assign, createActor, setup, enqueueActions } from 'xstate';
import type { Plugin } from '@/helpers/types';
import { typeOf } from '@/helpers/types/typed-ev';
import plugins, { defaultPlugin } from '@/plugins';
import { createApp } from 'vue'
import App from './app.vue'
import './style.css'

declare global {
  interface Window {
    applicationActor: typeof applicationActor;
  }
}
export interface ApplicationParams {
  plugins: Plugin[];
  defaultPlugin: Plugin;
}

export interface ApplicationContext {
  defaultToggles: {
    canvas: boolean;
    panel: boolean;
  },
  activePlugin: Plugin;
  defaultPlugin: Plugin;
  plugins: Plugin[];
}

export type ApplicationEvent =
  | { type: 'SELECT_PLUGIN'; pluginId: string }
  | { type: 'DEFAULT_TOGGLE'; area: 'canvas' | 'panel' }

export const applicationMachine = setup({
  types: {
    context: {} as ApplicationContext,
    events: {} as ApplicationEvent,
    input: {} as ApplicationParams,
  },
  actors: {},
  actions: {
    setActivePlugin: assign(({ context, event }) => ({
      activePlugin: context.plugins.find(p => p.id === typeOf('SELECT_PLUGIN', event).pluginId) || context.activePlugin
    })),
    handledDefaultToggle: assign(({ context }, params: 'canvas' | 'panel') => ({
      defaultToggles: {
        ...context.defaultToggles,
        [params]: !context.defaultToggles[params]
      }
    })),
    spawnPluginActors: enqueueActions(({ enqueue, context }) => {
      enqueue.spawnChild(context.defaultPlugin.state, { systemId: context.defaultPlugin.id });

      for (const plugin of context.plugins) {
        enqueue.spawnChild(plugin.state, { systemId: plugin.id });
      }
    }),
  }
}).createMachine({
  id: 'application',
  context: ({ input }) => ({
    plugins: input.plugins,
    activePlugin: input.plugins[0],
    defaultPlugin: input.defaultPlugin,
    defaultToggles: {
      canvas: false,
      panel: false,
    },
  }),
  entry: 'spawnPluginActors',
  on: {
    DEFAULT_TOGGLE: {
      actions: {
        type: 'handledDefaultToggle',
        params: ({ event }) => event.area
      }
    },
    SELECT_PLUGIN: {
      actions: 'setActivePlugin'
    }
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


window.applicationActor = applicationActor;

createApp(App).mount('#root')
