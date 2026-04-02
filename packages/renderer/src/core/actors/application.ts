import { assign, setup, enqueueActions, fromCallback, spawnChild, sendTo, fromPromise, type ActorRefFrom } from 'xstate';
import type { Plugin } from '@/core/types';
import type { HotkeyEvent } from '@/core/utils/hotkeys';
import { processHotkeys } from '@/core/utils/hotkeys';
import type { ApplicationHotkeys } from '@app/api';
import { trpc } from '@/core/trpc';
import { safeEvents } from '@/core/types/safe-events';
import trailActor, { computeCrumbs, type UpdateData } from '@/core/actors/route-trailer';
import { guidedTourMachine } from '@/core/actors/tour/guided-tour';
import type { ContextMenuItem } from '@/core/context-menu';

interface BreadcrumbItem {
  label: string;
  target: string;
  info?: any;
}

export interface ApplicationParams {
  plugins: Plugin[];
  defaultPlugin: Plugin;
}

export interface ApplicationContext {
  defaultToggles: {
    canvas: boolean;
  },
  activePlugin: Plugin;
  defaultPlugin: Plugin;
  plugins: Plugin[];
  visiblePlugins: Plugin[]; // Filtered list of visible plugins
  pluginVisibility: Record<string, boolean>; // Plugin visibility settings
  pluginHistory: string[]; // History of plugin IDs for back/forward navigation
  historyIndex: number; // Current position in history
  breadcrumbs: BreadcrumbItem[];
  contextMenuItems: ContextMenuItem[];
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

type AppActor = ReturnType<typeof createApplicationState>;

export type AppState = ActorRefFrom<AppActor>;

export type ApplicationEvent =
  | { type: 'SELECT_PLUGIN'; pluginId: string; historyIndex?: number }
  | { type: 'DEFAULT_TOGGLE'; area: 'canvas' }
  | { type: 'TRAIL_UPDATE'; crumbs: BreadcrumbItem[]; target: string; menuItems: ContextMenuItem[] }
  | { type: 'TRAIL_CLICK'; target: string; info?: any }
  | { type: 'RESIZE_PANEL'; panel: 'canvas' | 'inspection'; size: number }
  | { type: 'TOGGLE_INSPECTION_PANEL' }
  | HotkeyEvent
  | { type: 'SWITCH_PLUGIN_UP' }
  | { type: 'SWITCH_PLUGIN_DOWN' }
  | { type: 'NAVIGATE_BACK' }
  | { type: 'NAVIGATE_FORWARD' }
  | { type: 'FORWARD_HOTKEY'; event: HotkeyEvent }
  | { type: 'PROCESS_GLOBAL_HOTKEY'; hotkeyEvent: HotkeyEvent; originalEvent?: KeyboardEvent }
  | { type: 'HOTKEYS_RECORDING_START' }
  | { type: 'HOTKEYS_RECORDING_END' }
  | { type: 'APPLICATION_HOTKEYS'; hotkeys: ApplicationContext['hotkeys'] }
  | { type: 'PLUGIN_VISIBILITY_UPDATED'; pluginVisibility: Record<string, boolean> }
  | { type: 'APPLICATION_RESTORE_LAST_PLUGIN'; lastActivePluginId: string }
  | { type: 'CLIENT_CONNECTED'; tourComplete: boolean }
  | { type: 'COMPLETE_ONBOARDING' }
  | { type: 'START_GUIDED_TOUR' }
  | { type: 'TOUR_NEXT' }
  | { type: 'TOUR_PREVIOUS' }
  | { type: 'TOUR_END' }
  | { type: 'TOUR_COMPLETE' }
  | { type: 'TOUR_ABORTED' }
  | { type: 'SHOW_INSPECTION_PANEL' }
  | { type: 'HIDE_INSPECTION_PANEL' }
  | { type: 'RESET_CHAT_HEIGHT' }
  | { type: 'ROUTE_TOUR_EVENT'; target: string; event: any }
  | { type: 'BACKEND_ERROR'; error: string }
  | { type: 'NOOP' }

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
        // Skip app hotkeys when typing in a tiptap editor
        const target = e.target as HTMLElement;
        if (target.closest?.('.ProseMirror')) return;

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

    mouseListener: fromCallback(({ system }) => {
      const handleMouseDown = (e: MouseEvent) => {
        const appActor = system.get(application);

        // Mouse button 3 = back, mouse button 4 = forward
        if (e.button === 3) {
          e.preventDefault();
          appActor.send({ type: 'NAVIGATE_BACK' });
        } else if (e.button === 4) {
          e.preventDefault();
          appActor.send({ type: 'NAVIGATE_FORWARD' });
        }
      };

      window.addEventListener('mousedown', handleMouseDown);

      return () => {
        window.removeEventListener('mousedown', handleMouseDown);
      };
    }),

    pluginTrailer: fromCallback<{ type: 'TRAIL_NEW_PLUGIN'; id: string }, string>(({ system, receive, input: id }) => {
      const onStateChange = ({ crumbs, target, menuItems }: UpdateData) =>
        system.get(application).send({ type: 'TRAIL_UPDATE', crumbs, target, menuItems });

      let unsubscribe = trailActor(system.get(id), onStateChange);

      receive((event) => {
        if (event.type === 'TRAIL_NEW_PLUGIN') {
          unsubscribe();
          unsubscribe = trailActor(system.get(event.id), onStateChange);
        }
      });

      return unsubscribe;
    }),

    backendListener: fromCallback(({ system, sendBack }) => {
      console.log('connecting to backend');

      // Check if backend already failed before we started listening (race condition fix)
      window.electronAPI?.apiStatus?.getStatus().then((status) => {
        if (status.error) {
          sendBack({ type: 'BACKEND_ERROR', error: status.error });
        }
      });

      const subscription = trpc.bus.sub.subscribe(
        undefined, // sessionId is ignored now
        {
          // onConnectionStateChange(state) {
          // },
          onError: (error: any) => {
            console.error('Error in subscription:', error);
            sendBack({ type: 'BACKEND_ERROR', error: String(error) });
          },
          onData: (event: any) => {
            const { pluginId, ...ev } = event;

            if (application === pluginId || pluginId === '_meta') {
              sendBack(ev);
            } else {
              const pluginActor = system.get(pluginId);
              if (pluginActor) {
                pluginActor.send(ev);
              } else {
                console.warn(`[Backend] Plugin actor not found for ID: ${pluginId}`, ev);
              }
            }
          },
        }
      );

      // Listen for Electron IPC crash notifications (instant detection)
      const cleanupApiStatus = window.electronAPI?.apiStatus?.onEvent((event) => {
        if (event.type === 'api:stopped' || event.type === 'api:error') {
          sendBack({
            type: 'BACKEND_ERROR',
            error: event.error || 'The backend process stopped unexpectedly.',
          });
        }
      });

      return () => {
        subscription.unsubscribe();
        cleanupApiStatus?.();
      };
    }),
    guidedTour: guidedTourMachine,
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

    navigate: ({ context, self }, direction: -1 | 1) => {
      const newIndex = context.historyIndex + direction;
      if (newIndex < 0 || newIndex >= context.pluginHistory.length) return;

      self.send({
        type: 'SELECT_PLUGIN',
        pluginId: context.pluginHistory[newIndex],
        historyIndex: newIndex
      });
    },

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
    setBreadcrumbs: assign(({ event }) => ({
      breadcrumbs: typeOf('TRAIL_UPDATE', event).crumbs,
      contextMenuItems: typeOf('TRAIL_UPDATE', event).menuItems,
    })),
    setActivePlugin: enqueueActions(({ context, event, enqueue, system }) => {
      const { pluginId, historyIndex } = typeOf('SELECT_PLUGIN', event);
      const newPlugin = context.plugins.find(p => p.id === pluginId) || context.activePlugin;

      // Send plugin activation events
      if (context.activePlugin.id !== newPlugin.id) {
        system.get(context.activePlugin.id).send({ type: 'PLUGIN_DEACTIVATED' });
        system.get(newPlugin.id).send({ type: 'PLUGIN_ACTIVATED' });
      }

      // Update context and history in one assignment
      enqueue.assign(({ context }) => {
        const updates: any = {
          activePlugin: newPlugin,
          defaultToggles: { ...context.defaultToggles, canvas: false }
        };

        // Skip history update if same plugin
        if (context.activePlugin.id === newPlugin.id) return updates;

        if (historyIndex !== undefined) {
          // Navigation: just update index
          updates.historyIndex = historyIndex;
        } else {
          // Manual selection: truncate and add
          const history = context.pluginHistory.slice(0, context.historyIndex + 1);
          if (history[history.length - 1] !== pluginId) {
            updates.pluginHistory = [...history, pluginId];
            updates.historyIndex = history.length;
          }
        }

        return updates;
      });

      // Persist the new active plugin if it changed
      if (context.activePlugin.id !== newPlugin.id) {
        enqueue(({ context }) => {
          const pluginId = newPlugin.id;

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
    handleDefaultToggle: assign(({ context }, params: 'canvas') => ({
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
          ? { canvasHeight: Math.max(20, Math.min(95, size)) } // 20-95% bounds
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
    completeOnboarding: ({ context, self }) => {
      // Navigate to agent plugin where onboarding thread artifacts are shown
      self.send({ type: 'SELECT_PLUGIN', pluginId: 'agent' });

      // Ensure chat panel is expanded to default height
      self.send({ type: 'RESET_CHAT_HEIGHT' });

      // Send single event to backend to complete the tour
      // Backend will handle setting tourComplete, plugin visibility, and triggering onboarding flow
      trpc.bus.send.mutate({
        systemId: 'settings',
        type: 'COMPLETE_ONBOARDING'
      });
    },
    startGuidedTour: ({ context, self }) => {
      // Hide non-tour plugins - only show threads, agent, and settings
      const tourVisibility: Record<string, boolean> = {};
      for (const plugin of context.plugins) {
        tourVisibility[plugin.id] = plugin.id === 'threads' || plugin.id === 'agent' || plugin.id === 'settings';
      }

      // Update backend settings
      trpc.bus.send.mutate({
        systemId: 'settings',
        type: 'UPDATE_SETTINGS',
        entityType: 'plugin',
        label: '_meta',
        path: ['visibility'],
        value: tourVisibility,
      });

      // Also update the local state immediately
      self.send({
        type: 'PLUGIN_VISIBILITY_UPDATED',
        pluginVisibility: tourVisibility
      });
    },
    showInspectionPanel: assign({
      panelSizes: ({ context }) => ({
        ...context.panelSizes,
        inspectionWidth: context.panelSizes.previousInspectionWidth || 400,
        previousInspectionWidth: undefined,
      }),
    }),
    hideInspectionPanel: assign({
      panelSizes: ({ context }) => ({
        ...context.panelSizes,
        previousInspectionWidth: context.panelSizes.inspectionWidth,
        inspectionWidth: 0,
      }),
    }),
    resetChatHeight: assign(({ context }) => {
      const defaultCanvasHeight = 50;
      const newSizes = { ...context.panelSizes, canvasHeight: defaultCanvasHeight };
      localStorage.setItem('agentbuddy-panel-sizes', JSON.stringify(newSizes));
      return { panelSizes: newSizes };
    }),
    routeEvent: ({ context, system, self, event }) => {
      const { target, event: targetEvent } = typeOf('ROUTE_TOUR_EVENT', event);

      // Check if this is a plugin visibility update and handle it immediately
      if (target === 'settings' &&
          targetEvent.type === 'SETTINGS.UPDATE' &&
          targetEvent.entityType === 'plugin' &&
          targetEvent.label === '_meta' &&
          targetEvent.path?.[0] === 'visibility') {

        let newVisibility = context.pluginVisibility || {};

        // Single plugin update: path = ['visibility', pluginId]
        if (targetEvent.path.length === 2) {
          const pluginId = targetEvent.path[1];
          newVisibility = { ...newVisibility, [pluginId]: targetEvent.value };
        }
        // Full visibility update: path = ['visibility']
        else if (targetEvent.path.length === 1 && typeof targetEvent.value === 'object') {
          newVisibility = targetEvent.value;
        }

        // Send immediate visibility update to application
        self.send({
          type: 'PLUGIN_VISIBILITY_UPDATED',
          pluginVisibility: newVisibility
        });
      }

      // Continue with normal routing
      if (target === 'application') {
        self.send(targetEvent);
      }
      // Otherwise, route to the specified plugin
      else {
        const targetActor = system.get(target);
        if (targetActor) {
          targetActor.send(targetEvent);
        } else {
          console.warn(`[Tour] Could not find actor for target: ${target}`);
        }
      }
    },
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
      pluginHistory: [initialActivePlugin.id], // Start with initial plugin in history
      historyIndex: 0, // Start at first position
      breadcrumbs: [],
      contextMenuItems: [],
      defaultToggles: {
        canvas: false,
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
    ({ context, system }) => {
      // Send initial activation to the active plugin
      system.get(context.activePlugin.id).send({ type: 'PLUGIN_ACTIVATED' });
    },
    'trailActivePlugin',
    spawnChild('hotkeyListener', { id: 'hotkeyListener' }),
    spawnChild('mouseListener', { id: 'mouseListener' }),
  ],
  states: {
    'setup': {
      tags: ['setup'],
      entry: spawnChild('backendListener'),
      after: {
        5000: {
          target: 'error',
          actions: () => {
            window.__showErrorPage?.(
              'Unable to connect',
              'The backend did not respond within 5 seconds. It may have crashed during startup.\n\nCheck the terminal/logs for details.'
            );
          }
        }
      },
      on: {
        'CLIENT_CONNECTED': [
          {
            actions: [],
            target: 'onboarding',
            guard: ({ event }) => event.tourComplete === false
          },
          {
            actions: [],
            target: 'running',
          }
        ],
      }
    },
    'onboarding': {
      tags: ['onboarding'],
      on: {
        COMPLETE_ONBOARDING: {
          actions: 'completeOnboarding',
          target: 'running',
        },
        START_GUIDED_TOUR: {
          actions: ['startGuidedTour'],
          target: 'guided-tour',
        }
      }
    },
    'guided-tour': {
      tags: ['guided-tour'],
      invoke: {
        id: 'guidedTour',
        src: 'guidedTour',
        onDone: {
          actions: 'completeOnboarding',
          target: 'running',
        }
      },
      on: {
        TOUR_NEXT: {
          actions: sendTo('guidedTour', { type: 'NEXT' })
        },
        TOUR_PREVIOUS: {
          actions: sendTo('guidedTour', { type: 'PREVIOUS' })
        },
        TOUR_END: {
          actions: sendTo('guidedTour', { type: 'END' })
        },
        TOUR_COMPLETE: {
          actions: sendTo('guidedTour', { type: 'COMPLETE' })
        },
        TOUR_ABORTED: {
        },
        ROUTE_TOUR_EVENT: {
          actions: 'routeEvent'
        },
        SELECT_PLUGIN: {
          actions: [
            'setActivePlugin',
            'trailNewPlugin',
          ]
        },
        SHOW_INSPECTION_PANEL: {
          actions: 'showInspectionPanel'
        },
        HIDE_INSPECTION_PANEL: {
          actions: 'hideInspectionPanel'
        },
        PLUGIN_VISIBILITY_UPDATED: {
          actions: 'updatePluginVisibility'
        }
      }
    },
    'running': {
      tags: ['running'],
      initial: 'connected',
      states: {
        'connected': {},
        'disconnected': {},
      }
    },
    'error': {
      tags: ['error'],
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
    DEFAULT_TOGGLE: {
      guard: 'isCanvasToggle',
      actions: [
        'trailNewPlugin',
        {
          type: 'handleDefaultToggle',
          params: ({ event }) => event.area // 'canvas'
        }
      ]
    },
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
    NAVIGATE_BACK: {
      guard: ({ context }) => context.historyIndex > 0,
      actions: { type: 'navigate', params: -1 }
    },
    NAVIGATE_FORWARD: {
      guard: ({ context }) => context.historyIndex < context.pluginHistory.length - 1,
      actions: { type: 'navigate', params: 1 }
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
    SHOW_INSPECTION_PANEL: {
      actions: 'showInspectionPanel'
    },
    HIDE_INSPECTION_PANEL: {
      actions: 'hideInspectionPanel'
    },
    RESET_CHAT_HEIGHT: {
      actions: 'resetChatHeight'
    },
    BACKEND_ERROR: {
      target: '.error',
      actions: ({ event }) => {
        const { error } = typeOf('BACKEND_ERROR', event);
        window.__showErrorPage?.('Connection lost', `Backend error: ${error}`);
      }
    },
    NOOP: {
      // No-op event, do nothing
    },
  }
});
