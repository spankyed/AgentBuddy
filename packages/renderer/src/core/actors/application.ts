import { assign, setup, enqueueActions, fromCallback, spawnChild, sendTo, fromPromise } from 'xstate';
import type { Plugin, HotkeyEvent } from '@/core/types';
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
  breadcrumbs: BreadcrumbItem[];
  targetView: string;
  panelSizes: {
    canvasHeight: number; // percentage of main area height
    inspectionWidth: number; // pixels
    previousInspectionWidth?: number; // for restoring after collapse
  };
  hotkeysDisabled: boolean;
  hotkeys: {
    switchPluginUp?: {
      key: string;
      modifiers: string[];
    };
    switchPluginDown?: {
      key: string;
      modifiers: string[];
    };
    toggleInspectionPanel?: {
      key: string;
      modifiers: string[];
    };
  };
}

export const application = 'application' as const;

// Helper to convert hotkey from settings format to keyboard event format
function convertHotkeyToDefinition(hotkey: { key: string; modifiers: string[] } | undefined, action: { type: string }) {
  if (!hotkey || !hotkey.key) return null;
  
  return {
    key: hotkey.key,
    metaKey: hotkey.modifiers.includes('cmd'),
    ctrlKey: hotkey.modifiers.includes('ctrl'),
    altKey: hotkey.modifiers.includes('alt') || hotkey.modifiers.includes('option'),
    shiftKey: hotkey.modifiers.includes('shift'),
    action
  };
}

// Helper to match keyboard event with hotkey definition
function matchesHotkey(e: KeyboardEvent, hotkey: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean } | null): boolean {
  if (!hotkey) return false;
  
  return (
    e.key === hotkey.key &&
    (hotkey.metaKey === undefined || e.metaKey === hotkey.metaKey) &&
    (hotkey.ctrlKey === undefined || e.ctrlKey === hotkey.ctrlKey) &&
    (hotkey.altKey === undefined || e.altKey === hotkey.altKey) &&
    (hotkey.shiftKey === undefined || e.shiftKey === hotkey.shiftKey)
  );
}

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
  | { type: 'PROCESS_GLOBAL_HOTKEY'; action: { type: string; payload?: any } }
  | { type: 'HOTKEYS_RECORDING_START' }
  | { type: 'HOTKEYS_RECORDING_END' }
  | { type: 'APPLICATION_HOTKEYS'; hotkeys: ApplicationContext['hotkeys'] }

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
        // Get current hotkeys from application context
        const appActor = system.get(application);
        const snapshot = appActor.getSnapshot();
        const hotkeys = snapshot.context.hotkeys;
        
        // Build dynamic hotkey definitions from context
        const hotkeyDefinitions = [
          convertHotkeyToDefinition(hotkeys.toggleInspectionPanel, { type: 'TOGGLE_INSPECTION_PANEL' }),
          convertHotkeyToDefinition(hotkeys.switchPluginUp, { type: 'SWITCH_PLUGIN_UP' }),
          convertHotkeyToDefinition(hotkeys.switchPluginDown, { type: 'SWITCH_PLUGIN_DOWN' })
        ].filter(Boolean);
        
        // Check for matching hotkey
        const matchingHotkey = hotkeyDefinitions.find(hotkey => 
          matchesHotkey(e, hotkey)
        );
        
        if (matchingHotkey) {
          e.preventDefault();
          appActor.send({ 
            type: 'PROCESS_GLOBAL_HOTKEY', 
            action: matchingHotkey.action 
          });
          return;
        }
        
        // Forward all other hotkeys to the active plugin
        const hotkeyEvent: HotkeyEvent = {
          type: 'HOTKEY_PRESSED',
          key: e.key,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          preventDefault: () => e.preventDefault()
        };
        
        appActor.send({ type: 'FORWARD_HOTKEY', event: hotkeyEvent });
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
    
    processGlobalHotkey: ({ self, event }) => {
      const { action } = typeOf('PROCESS_GLOBAL_HOTKEY', event);
      // Send the action as an ApplicationEvent - it will match one of the defined types
      self.send(action as ApplicationEvent);
    },
    
    setHotkeysDisabled: assign({
      hotkeysDisabled: (_, value: boolean) => value
    }),
    
    switchPluginByDirection: ({ context, event, self }) => {
      // Use all plugins for switching
      const allPlugins = context.plugins;
      
      if (allPlugins.length === 0) return;
      
      const currentIndex = allPlugins.findIndex(p => p.id === context.activePlugin.id);
      if (currentIndex === -1) return;
      
      let newIndex: number;
      if (event.type === 'SWITCH_PLUGIN_UP') {
        newIndex = currentIndex === 0 ? allPlugins.length - 1 : currentIndex - 1;
      } else {
        newIndex = currentIndex === allPlugins.length - 1 ? 0 : currentIndex + 1;
      }
      
      const newPluginId = allPlugins[newIndex].id;
      
      self.send({
        type: 'SELECT_PLUGIN',
        pluginId: newPluginId
      });
    },
    
    forwardHotkeyToPlugin: ({ context, event, system }) => {
      try {
        const activePluginActor = system.get(context.activePlugin.id);
        if (activePluginActor) {
          activePluginActor.send(typeOf('FORWARD_HOTKEY', event).event);
        }
      } catch (error) {
        // Silently ignore if plugin can't receive hotkey events
        console.debug(`Plugin ${context.activePlugin.id} cannot receive hotkey events`, error);
      }
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
      inspectionWidth: 448, // 28rem = 448px (16px base)
    };
    const panelSizes = savedSizes ? { ...defaultSizes, ...JSON.parse(savedSizes) } : defaultSizes;
    
    return {
      plugins: input.plugins,
      activePlugin: input.plugins[0],
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