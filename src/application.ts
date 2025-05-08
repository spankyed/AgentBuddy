import type { Actor } from 'xstate';
import { assign, createActor, setup, enqueueActions, log, fromCallback, spawnChild, sendTo } from 'xstate';
import { createBrowserInspector } from '@statelyai/inspect';
import type { Plugin } from '@/helpers/types';
import logErrors from '@/helpers/log-errors';
import { typeOf } from '@/helpers/types/typed-ev';
import trailActor, { type UpdateData } from '@/helpers/trail-actor';
import plugins, { defaultPlugin } from '@/plugins';
import { createApp } from 'vue'
import App from './app.vue'
import './style.css'

const { inspect } = createBrowserInspector();

declare global {
  interface Window {
    applicationActor: Actor<typeof applicationMachine>;
  }
}

interface BreadcrumbItem {
  label: string;
  target: string;
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
  breadcrumbs: BreadcrumbItem[];
  targetView: string;
}

export type ApplicationEvent =
  | { type: 'SELECT_PLUGIN'; pluginId: string }
  | { type: 'DEFAULT_TOGGLE'; area: 'canvas' | 'panel' }
  | { type: 'TRAIL_UPDATE'; crumbs: BreadcrumbItem[]; target: string }
  | { type: 'TRAIL_CLICK'; target: string }

export const applicationMachine = setup({
  types: {
    context: {} as ApplicationContext,
    events: {} as ApplicationEvent,
    input: {} as ApplicationParams,
  },
  actors: {
    pluginTrailer: fromCallback<{ type: 'TRAIL_NEW_PLUGIN'; id: string }, string>(({ system, receive, input: id }) => {
      const onStateChange = ({ crumbs, target }: UpdateData) =>
        system.get('application').send({ type: 'TRAIL_UPDATE', crumbs, target });

      let unsubscribe = trailActor(system.get(id), onStateChange);

      receive((event) => {
        if (event.type === 'TRAIL_NEW_PLUGIN') {
          unsubscribe();
          unsubscribe = trailActor(system.get(event.id), onStateChange);
        }
      });

      return unsubscribe;
    }),
  },
  actions: {
    setTargetView: assign(({ event }) => ({
      targetView: (event as any).target
      // targetView: typeOf(['TRAIL_CLICK', 'TRAIL_UPDATE'], event).target
    })),
    sendRouteClick: sendTo(({ system, context }) => system.get(context.activePlugin.id), ({ event }) => event),
    setBreadcrumbs: assign(({ event }) => ({ breadcrumbs: typeOf('TRAIL_UPDATE', event).crumbs })),
    setActivePlugin: assign(({ context, event }) => ({
      defaultToggles: { canvas: false, panel: false },
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
    trailNewPlugin: sendTo('pluginTrailer', ({ context }) => ({
      type: 'TRAIL_NEW_PLUGIN',
      id: context.activePlugin.id
    })),
    trailActivePlugin: spawnChild('pluginTrailer', { id: 'pluginTrailer', input: ({ context }) => context.activePlugin.id })
  }
}).createMachine({
  id: 'application',
  context: ({ input }) => ({
    plugins: input.plugins,
    activePlugin: input.plugins[0],
    defaultPlugin: input.defaultPlugin,
    breadcrumbs: [],
    defaultToggles: {
      canvas: false,
      panel: false,
    },
    targetView: '',
  }),
  entry: [
    'spawnPluginActors',
    'trailActivePlugin'
  ],
  on: {
    TRAIL_UPDATE: {
      actions: ['setBreadcrumbs', 'setTargetView'],
    },
    TRAIL_CLICK: {
      actions: ['setTargetView', 'sendRouteClick'],
    },
    DEFAULT_TOGGLE: {
      actions: {
        type: 'handledDefaultToggle',
        params: ({ event }) => event.area
      }
    },
    SELECT_PLUGIN: {
      actions: [
        'setActivePlugin',
        'trailNewPlugin',
      ]
    },
  }
});

export const applicationActor = createActor(applicationMachine, {
  systemId: 'application',
  inspect,
  input: {
    defaultPlugin,
    plugins,
  }
}).start();

applicationActor.subscribe(logErrors('Application'));

window.applicationActor = applicationActor;

createApp(App).mount('#root')
