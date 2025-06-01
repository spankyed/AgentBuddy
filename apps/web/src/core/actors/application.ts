import { assign, setup, enqueueActions, fromCallback, spawnChild, sendTo, fromPromise } from 'xstate';
import type { Plugin } from '@/core/types';
import { trpc } from '@/core/trpc';
import { safeEvents } from '@/core/types/safe-events';
import trailActor, { computeCrumbs, type UpdateData } from '@/core/actors/route-trailer';
import type { StartupData } from '@abuddy/api';
import { entries } from '../utils';

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

export const application = 'application' as const;

export type ApplicationEvent =
  | { type: 'STARTUP'; startupData: StartupData }
  | { type: 'SELECT_PLUGIN'; pluginId: string }
  | { type: 'DEFAULT_TOGGLE'; area: 'canvas' | 'panel' }
  | { type: 'TRAIL_UPDATE'; crumbs: BreadcrumbItem[]; target: string }
  | { type: 'TRAIL_CLICK'; target: string }

const typeOf = safeEvents<ApplicationEvent>();

export const createApplicationState = () => setup({
  types: {
    context: {} as ApplicationContext,
    events: {} as ApplicationEvent,
    input: {} as ApplicationParams,
  },
  actors: {
    pluginTrailer: fromCallback<{ type: 'TRAIL_NEW_PLUGIN'; id: string }, string>(({ system, receive, input: id }) => {
      const onStateChange = ({ crumbs, target }: UpdateData) =>
        system.get(application).send({ type: 'TRAIL_UPDATE', crumbs, target });

      let unsubscribe = trailActor(system.get(id), onStateChange);

      receive((event) => {
        if (event.type === 'TRAIL_NEW_PLUGIN') {
          unsubscribe();
          unsubscribe = trailActor(system.get(event.id), onStateChange);
        }
      });

      return unsubscribe;
    }),
    
    backendListener: fromCallback(({ system }) => {
      console.log('connecting to backend');
      const subscription = trpc.bus.sub.subscribe(
        undefined, // sessionId is ignored now
        {
          // onConnectionStateChange(state) {
          // },
          onError: (error) => {
            console.error('Error in subscription:', error);
          },
          onData: (event) => {
            console.log('event: ', event);
            const { pluginId, ...ev } = event;
            system.get(pluginId).send(ev);
          },
        }
      );
      
      return () => {
        subscription.unsubscribe();
      };
    }),
  },
  actions: {
    sendStartupData: ({ system, event }) => {
      for (const [pluginId, data] of entries(typeOf('STARTUP', event).startupData)) {
        system.get(pluginId).send({ type: 'STARTUP', pluginData: data });
      }
    },
    setTargetView: assign(({ event, system }, params?: string) => ({
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      targetView: params ? computeCrumbs(system.get(params).getSnapshot()) : (event as any).target
    })),
    sendRouteClick: sendTo(({ system, context }) => 
      system.get(context.defaultToggles.canvas ? context.defaultPlugin.id : context.activePlugin.id), ({ event }) => event),
    setBreadcrumbs: assign(({ event }) => ({ breadcrumbs: typeOf('TRAIL_UPDATE', event).crumbs })),
    setActivePlugin: assign(({ context, event }) => ({
      defaultToggles: { ...context.defaultToggles, canvas: false },
      activePlugin: context.plugins.find(p => p.id === typeOf('SELECT_PLUGIN', event).pluginId) || context.activePlugin
    })),
    handleDefaultToggle: assign(({ context }, params: 'canvas' | 'panel') => ({
      defaultToggles: {
        ...context.defaultToggles,
        [params]: !context.defaultToggles[params]
      }
    })),
    trailActivePlugin: spawnChild('pluginTrailer', { id: 'pluginTrailer', input: ({ context }) => context.activePlugin.id }),
    trailNewPlugin: enqueueActions(({ enqueue, context, event }) => {
      let pluginId = ''
      if (event.type === 'DEFAULT_TOGGLE') {
        pluginId = !context.defaultToggles.canvas ? context.defaultPlugin.id : context.activePlugin.id;
      } else {
        pluginId = typeOf('SELECT_PLUGIN', event).pluginId;
      }

      enqueue.sendTo('pluginTrailer', {
        type: 'TRAIL_NEW_PLUGIN',
        id: pluginId
      });
      // enqueue({ type: 'setTargetView', params: pluginId });
      enqueue.assign(({ system }) => ({
        targetView: computeCrumbs(system.get(pluginId).getSnapshot()).target
      }))
    }),
    spawnPluginActors: enqueueActions(({ enqueue, context }) => {
      // enqueue.spawnChild(context.defaultPlugin.state, { systemId: context.defaultPlugin.id });

      for (const plugin of context.plugins) {
        enqueue.spawnChild(plugin.state, { systemId: plugin.id });
      }
    }),
  },
  guards: {
    isCanvasToggle: ({ event }) => typeOf('DEFAULT_TOGGLE', event).area === 'canvas',
  },
}).createMachine({
  id: application,
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
  initial: 'setup',
  entry: [
    'spawnPluginActors',
    'trailActivePlugin',
  ],
  states: {
    'setup': {
      always: [{
        target: 'running',
        actions: spawnChild('backendListener'),
      }]
    },
    'running': {
      initial: 'connected',
      states: {
        'connected': {},
        'disconnected': {},
      }
    },
  },
  on: {
    STARTUP: {
      actions: ['sendStartupData'],
    },
    TRAIL_UPDATE: {
      actions: ['setBreadcrumbs', 'setTargetView'],
    },
    TRAIL_CLICK: {
      actions: ['setTargetView', 'sendRouteClick'],
    },
    DEFAULT_TOGGLE: [
      {
        guard: 'isCanvasToggle',
        actions: [
          'trailNewPlugin',
          {
            type: 'handleDefaultToggle',
            params: ({ event }) => event.area // 'canvas'
          }
        ]
      },
      {
        actions: {
          type: 'handleDefaultToggle',
          params: ({ event }) => event.area // 'panel'
        }
      }
    ],
    SELECT_PLUGIN: {
      actions: [
        'setActivePlugin',
        'trailNewPlugin',
      ]
    },
  }
});