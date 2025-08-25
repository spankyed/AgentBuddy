import { assign, setup, enqueueActions, fromCallback, spawnChild, sendTo, fromPromise } from 'xstate';
import type { Plugin } from '@/core/types';
import type { HotkeyEvent } from '@/core/utils/hotkeys';
import { processHotkeys } from '@/core/utils/hotkeys';
import type { ApplicationHotkeys } from '@app/api';
import { trpc } from '@/core/trpc';
import { safeEvents } from '@/core/types/safe-events';
import trailActor, { computeCrumbs, type UpdateData } from '@/core/actors/route-trailer';

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
  visiblePlugins: Plugin[]; // Filtered list of visible plugins
  pluginVisibility: Record<string, boolean>; // Plugin visibility settings
  breadcrumbs: BreadcrumbItem[];
  targetView: string;
  panelSizes: {
    canvasHeight: number; // percentage of main area height
    inspectionWidth: number; // pixels
    previousInspectionWidth?: number; // for restoring after collapse
  };
  hotkeysDisabled: boolean;
  hotkeys: ApplicationHotkeys;
}

export const application = 'application' as const;

export type ApplicationEvent =
  | { type: 'SELECT_PLUGIN'; pluginId: string }
  | { type: 'DEFAULT_TOGGLE'; area: 'canvas' | 'panel' }
  | { type: 'TRAIL_UPDATE'; crumbs: BreadcrumbItem[]; target: string }
  | { type: 'TRAIL_CLICK'; target: string }
  | { type: 'RESIZE_PANEL'; panel: 'canvas' | 'inspection'; size: number }
  | { type: 'TOGGLE_INSPECTION_PANEL' }
  | HotkeyEvent
  | { type: 'SWITCH_PLUGIN_UP' }
  | { type: 'SWITCH_PLUGIN_DOWN' }
  | { type: 'FORWARD_HOTKEY'; event: HotkeyEvent }
  | { type: 'PROCESS_GLOBAL_HOTKEY'; hotkeyEvent: HotkeyEvent; originalEvent?: KeyboardEvent }
  | { type: 'HOTKEYS_RECORDING_START' }
  | { type: 'HOTKEYS_RECORDING_END' }
  | { type: 'APPLICATION_HOTKEYS'; hotkeys: ApplicationContext['hotkeys'] }
  | { type: 'PLUGIN_VISIBILITY_UPDATED'; pluginVisibility: Record<string, boolean> }
  | { type: 'APPLICATION_RESTORE_LAST_PLUGIN'; lastActivePluginId: string }

const typeOf = safeEvents<ApplicationEvent>();

export const createApplicationState = () => setup({
  types: {
    context: {} as ApplicationContext,
    events: {} as ApplicationEvent,
    input: {} as ApplicationParams,
  },
  actors: {
    hotkeyListener: fromCallback(({ system }) => {
      const handleKeyDown = (e: KeyboardEvent) => {
        const appActor = system.get(application);
        
        // Create hotkey event and send to be processed
        const hotkeyEvent: HotkeyEvent = {
          type: 'HOTKEY_PRESSED',
          key: e.key,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          preventDefault: () => e.preventDefault()
        };
        
        appActor.send({ 
          type: 'PROCESS_GLOBAL_HOTKEY', 
          hotkeyEvent,
          originalEvent: e
        });
      };

      window.addEventListener('keydown', handleKeyDown);
      
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }),
    
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
          onError: (error: any) => {
            console.error('Error in subscription:', error);
          },
          onData: (event: any) => {
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
    updateHotkeys: assign(({ event }) => {
      const { hotkeys } = typeOf('APPLICATION_HOTKEYS', event);
      return { hotkeys };
    }),
    
    updatePluginVisibility: assign(({ event, context }) => {
      const { pluginVisibility } = typeOf('PLUGIN_VISIBILITY_UPDATED', event);
      
      // Filter plugins based on visibility
      const visiblePlugins = context.plugins.filter(plugin => 
        pluginVisibility[plugin.id] !== false
      );
      
      return { 
        pluginVisibility,
        visiblePlugins
      };
    }),
    
    syncLastActivePlugin: ({ event, self, context }) => {
      const { lastActivePluginId } = typeOf('APPLICATION_RESTORE_LAST_PLUGIN', event);
      
      // Sync localStorage with backend
      localStorage.setItem('agentbuddy-last-active-plugin', lastActivePluginId);
      
      // Only switch if plugin exists and differs from current
      const targetPlugin = context.plugins.find(p => p.id === lastActivePluginId);
      if (targetPlugin && targetPlugin.id !== context.activePlugin.id) {
        self.send({ type: 'SELECT_PLUGIN', pluginId: lastActivePluginId });
      }
    },
    
    processGlobalHotkey: ({ self, context, system, event }) => {
      const { hotkeyEvent, originalEvent } = typeOf('PROCESS_GLOBAL_HOTKEY', event);
      
      const actionType = processHotkeys(
        hotkeyEvent,
        context.hotkeys,
        {
          toggleInspectionPanel: 'TOGGLE_INSPECTION_PANEL',
          switchPluginUp: 'SWITCH_PLUGIN_UP',
          switchPluginDown: 'SWITCH_PLUGIN_DOWN'
        }
      );
      
      if (actionType) {
        if (originalEvent) {
          originalEvent.preventDefault();
        }
        self.send({ type: actionType });
      } else {
        // Not an application hotkey, forward to plugins
        self.send({ type: 'FORWARD_HOTKEY', event: hotkeyEvent });
      }
    },
    
    setHotkeysDisabled: assign({
      hotkeysDisabled: (_, value: boolean) => value
    }),
    
    switchPluginByDirection: ({ context, event, self }) => {
      // Use only visible plugins for switching
      const visiblePlugins = context.visiblePlugins;
      
      if (visiblePlugins.length === 0) return;
      
      const currentIndex = visiblePlugins.findIndex(p => p.id === context.activePlugin.id);
      if (currentIndex === -1) return;
      
      let newIndex: number;
      if (event.type === 'SWITCH_PLUGIN_UP') {
        newIndex = currentIndex === 0 ? visiblePlugins.length - 1 : currentIndex - 1;
      } else {
        newIndex = currentIndex === visiblePlugins.length - 1 ? 0 : currentIndex + 1;
      }
      
      const newPluginId = visiblePlugins[newIndex].id;
      
      self.send({
        type: 'SELECT_PLUGIN',
        pluginId: newPluginId
      });
    },
    
    forwardHotkeyToPlugin: ({ context, event, system }) => {
      const hotkeyEvent = typeOf('FORWARD_HOTKEY', event).event;
      
      // First, send to all plugins that have global hotkeys
      const globalPlugins = context.plugins.filter(plugin => 
        plugin.hotkeys?.some(h => h.global)
      );
      
      for (const plugin of globalPlugins) {
        const pluginActor = system.get(plugin.id);
        pluginActor.send(hotkeyEvent);
      }
      
      // Then send to active plugin for non-global hotkeys
      const activePluginActor = system.get(context.activePlugin.id);
      activePluginActor.send(hotkeyEvent);
    },
    
    setTargetView: assign(({ event, system }, params?: string) => ({
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      targetView: params ? computeCrumbs(system.get(params).getSnapshot()) : (event as any).target
    })),
    sendRouteClick: sendTo(({ system, context }) => 
      system.get(context.defaultToggles.canvas ? context.defaultPlugin.id : context.activePlugin.id), ({ event }) => event),
    setBreadcrumbs: assign(({ event }) => ({ breadcrumbs: typeOf('TRAIL_UPDATE', event).crumbs })),
    setActivePlugin: enqueueActions(({ context, event, enqueue, system }) => {
      const previousPlugin = context.activePlugin;
      const newPlugin = context.plugins.find(p => p.id === typeOf('SELECT_PLUGIN', event).pluginId) || context.activePlugin;
      
      // Send deactivation event to previous plugin
      if (previousPlugin && previousPlugin.id !== newPlugin.id) {
        system.get(previousPlugin.id).send({ type: 'PLUGIN_DEACTIVATED' });
      }
      
      // Send activation event to new plugin
      system.get(newPlugin.id).send({ type: 'PLUGIN_ACTIVATED' });
      
      // Update context
      enqueue.assign({
        defaultToggles: { ...context.defaultToggles, canvas: false },
        activePlugin: newPlugin
      });
      
      // Persist the new active plugin if it changed
      if (previousPlugin && previousPlugin.id !== newPlugin.id) {
        enqueue(({ context }) => {
          const pluginId = context.activePlugin.id;
          
          // Save to localStorage for immediate access on next load
          localStorage.setItem('agentbuddy-last-active-plugin', pluginId);
          
          // Send to backend to persist across sessions/devices
          trpc.bus.send.mutate({
            systemId: 'settings',
            type: 'UPDATE_SETTINGS',
            entityType: 'plugin',
            label: '_meta',
            path: ['lastActivePlugin'],
            value: pluginId
          });
        });
      }
    }),
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
      enqueue.assign(({ system }) => {
        const pluginActor = system.get(pluginId);
        if (pluginActor) {
          return {
            targetView: computeCrumbs(pluginActor.getSnapshot()).target
          };
        }
        return {};
      })
    }),
    spawnPluginActors: enqueueActions(({ enqueue, context }) => {
      // enqueue.spawnChild(context.defaultPlugin.state, { systemId: context.defaultPlugin.id });

      for (const plugin of context.plugins) {
        enqueue.spawnChild(plugin.state, { systemId: plugin.id });
      }
    }),
    resizePanel: assign(({ context, event }) => {
      const { panel, size } = typeOf('RESIZE_PANEL', event);
      const newSizes = {
        ...context.panelSizes,
        ...(panel === 'canvas' 
          ? { canvasHeight: Math.max(20, Math.min(80, size)) } // 20-80% bounds
          : { inspectionWidth: Math.max(300, Math.min(800, size)) } // 300-800px bounds
        )
      };
      
      // Save to localStorage
      localStorage.setItem('agentbuddy-panel-sizes', JSON.stringify(newSizes));
      
      return {
        panelSizes: newSizes
      };
    }),
    toggleInspectionPanel: assign(({ context }) => {
      const isCollapsed = context.panelSizes.inspectionWidth === 0;
      const newSizes = {
        ...context.panelSizes,
        inspectionWidth: isCollapsed 
          ? (context.panelSizes.previousInspectionWidth || 448) 
          : 0,
        previousInspectionWidth: isCollapsed 
          ? context.panelSizes.previousInspectionWidth 
          : context.panelSizes.inspectionWidth
      };
      
      // Save to localStorage
      localStorage.setItem('agentbuddy-panel-sizes', JSON.stringify(newSizes));
      
      return {
        panelSizes: newSizes
      };
    }),
  },
  guards: {
    isCanvasToggle: ({ event }) => typeOf('DEFAULT_TOGGLE', event).area === 'canvas',
    areHotkeysEnabled: ({ context }) => !context.hotkeysDisabled,
  },
}).createMachine({
  id: application,
  context: ({ input }) => {
    // Load saved panel sizes from localStorage or use defaults
    const savedSizes = localStorage.getItem('agentbuddy-panel-sizes');
    const defaultSizes = {
      canvasHeight: 50, // 50% of main area
      inspectionWidth: 448, // 28rem = 448px (16px base),
    };
    const panelSizes = savedSizes ? { ...defaultSizes, ...JSON.parse(savedSizes) } : defaultSizes;
    
    // Load last active plugin from localStorage
    const savedLastActivePlugin = localStorage.getItem('agentbuddy-last-active-plugin');
    
    // Initialize with all plugins visible by default
    const pluginVisibility: Record<string, boolean> = {};
    input.plugins.forEach(plugin => {
      pluginVisibility[plugin.id] = true;
    });
    
    // Determine initial active plugin - use saved one if it exists and is valid
    let initialActivePlugin = input.plugins[0];
    if (savedLastActivePlugin) {
      const savedPlugin = input.plugins.find(p => p.id === savedLastActivePlugin);
      if (savedPlugin) {
        initialActivePlugin = savedPlugin;
      }
    }
    
    return {
      plugins: input.plugins,
      visiblePlugins: input.plugins, // Initially all plugins are visible
      pluginVisibility,
      activePlugin: initialActivePlugin,
      defaultPlugin: input.defaultPlugin,
      breadcrumbs: [],
      defaultToggles: {
        canvas: false,
        panel: false,
      },
      targetView: '',
      panelSizes,
      hotkeysDisabled: false,
      hotkeys: {}, // Start with empty hotkeys until loaded from backend
    };
  },
  initial: 'setup',
  entry: [
    'spawnPluginActors',
    'trailActivePlugin',
    spawnChild('hotkeyListener', { id: 'hotkeyListener' }),
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
    APPLICATION_HOTKEYS: {
      actions: 'updateHotkeys'
    },
    PLUGIN_VISIBILITY_UPDATED: {
      actions: 'updatePluginVisibility'
    },
    APPLICATION_RESTORE_LAST_PLUGIN: {
      actions: 'syncLastActivePlugin'
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
    RESIZE_PANEL: {
      actions: 'resizePanel'
    },
    TOGGLE_INSPECTION_PANEL: {
      actions: 'toggleInspectionPanel'
    },
    SWITCH_PLUGIN_UP: {
      actions: 'switchPluginByDirection'
    },
    SWITCH_PLUGIN_DOWN: {
      actions: 'switchPluginByDirection'
    },
    FORWARD_HOTKEY: {
      actions: 'forwardHotkeyToPlugin'
    },
    PROCESS_GLOBAL_HOTKEY: {
      guard: 'areHotkeysEnabled',
      actions: 'processGlobalHotkey'
    },
    HOTKEYS_RECORDING_START: {
      actions: {
        type: 'setHotkeysDisabled',
        params: true
      }
    },
    HOTKEYS_RECORDING_END: {
      actions: {
        type: 'setHotkeysDisabled',
        params: false
      }
    },
  }
});