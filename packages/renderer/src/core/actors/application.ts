import { assign, setup, enqueueActions, fromCallback, spawnChild, sendTo, type ActorRefFrom } from 'xstate';
import type { Plugin } from '@/core/types';
import type { HotkeyEvent } from '@/core/utils/hotkeys';
import { processHotkeys } from '@/core/utils/hotkeys';
import type { ApplicationHotkeys } from '@app/api';
import { trpc } from '@/core/trpc';
import { safeEvents } from '@/core/types/safe-events';
import trailActor, { computeCrumbs, type UpdateData } from '@/core/actors/route-trailer';
import type { ContextMenuItem } from '@/core/context-menu';
import { globalToast } from '@/core/toast';

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
    chatMaximized?: boolean; // when true, chat fills the main area and canvas + resizer are hidden
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
  | { type: 'MAXIMIZE_CHAT' }
  | { type: 'RESTORE_CHAT' }
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
  | { type: 'CLIENT_CONNECTED'; hasOnboarded: boolean }
  | { type: 'CLOSE_DEV_LETTER' }
  | { type: 'ONBOARDING_COMPLETE' }
  | { type: 'SHOW_INSPECTION_PANEL' }
  | { type: 'HIDE_INSPECTION_PANEL' }
  | { type: 'RESET_CHAT_HEIGHT' }
  | { type: 'SYSTEM_ERROR'; errorId?: string; title?: string; message: string; source?: string; operation?: string; entityId?: string; severity?: 'error' | 'fatal'; stack?: string; timestamp?: number }
  | { type: 'BACKEND_ERROR'; error: string | { message: string; stack?: string } }
  | { type: 'NOOP' }

const typeOf = safeEvents<ApplicationEvent>();

export const createApplicationState = () => setup({
  types: {
    context: {} as ApplicationContext,
    events: {} as ApplicationEvent,
    input: {} as ApplicationParams,
  },
  actors: {
    // Key state tracking ported from @vueuse/core useMagicKeys
    // Handles: per-modifier dependency tracking, ordered cleanup on modifier release,
    // macOS Meta keyup bug (#1312), blur/focus reset (#1350)
    hotkeyListener: fromCallback(({ system }) => {
      const current = new Set<string>();
      const metaDeps = new Set<string>();
      const depsMap = new Map<string, Set<string>>([
        ['Meta', metaDeps],
        ['Shift', new Set<string>()],
        ['Alt', new Set<string>()],
      ]);

      function updateDeps(value: boolean, e: KeyboardEvent, keys: string[]) {
        if (!value || typeof e.getModifierState !== 'function') return;
        for (const [modifier, depsSet] of depsMap) {
          if (e.getModifierState(modifier)) {
            keys.forEach(key => depsSet.add(key));
            break;
          }
        }
      }

      function clearDeps(value: boolean, key: string) {
        if (value) return;
        const depsMapKey = `${key[0].toUpperCase()}${key.slice(1)}`;
        const deps = depsMap.get(depsMapKey);
        if (!(['shift', 'alt'].includes(key)) || !deps) return;
        // Ordered cleanup: only clear keys pressed at or after the modifier,
        // preserving keys that were pressed before it
        const depsArray = Array.from(deps);
        const depsIndex = depsArray.indexOf(key);
        depsArray.forEach((dep, index) => {
          if (index >= depsIndex) current.delete(dep);
        });
        deps.clear();
      }

      function updateKeys(e: KeyboardEvent, value: boolean) {
        const key = e.key?.toLowerCase();
        if (!key) return;

        if (value) current.add(key);
        else current.delete(key);

        const code = e.code?.toLowerCase();
        if (code) {
          if (value) current.add(code);
          else current.delete(code);
        }

        updateDeps(value, e, [...current]);
        clearDeps(value, key);

        // macOS: Meta release doesn't fire keyup for keys held with it (#1312)
        if (key === 'meta' && !value) {
          for (const dep of metaDeps) current.delete(dep);
          metaDeps.clear();
        }
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        // Skip when typing in tiptap editor (unless modifier-based hotkey)
        const target = e.target as HTMLElement;
        if ((target.closest?.('.ProseMirror') || target.closest?.('.monaco-editor')) && !e.metaKey && !e.ctrlKey) return;

        updateKeys(e, true);

        // If an earlier handler (Tiptap/ProseMirror, Monaco, etc.) already consumed
        // the event, don't also run it through the global hotkey map. Prevents e.g.
        // Cmd+B both bolding text in the editor AND toggling the inspection panel.
        if (e.defaultPrevented) return;

        const appActor = system.get(application);
        const hotkeyEvent: HotkeyEvent = {
          type: 'HOTKEY_PRESSED',
          key: e.key,
          metaKey: current.has('meta'),
          ctrlKey: current.has('control'),
          altKey: current.has('alt'),
          shiftKey: current.has('shift'),
          preventDefault: () => e.preventDefault()
        };

        appActor.send({
          type: 'PROCESS_GLOBAL_HOTKEY',
          hotkeyEvent,
          originalEvent: e
        });
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        updateKeys(e, false);
      };

      const reset = () => {
        current.clear();
        for (const deps of depsMap.values()) deps.clear();
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('blur', reset);
      window.addEventListener('focus', reset);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('blur', reset);
        window.removeEventListener('focus', reset);
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

      const initial = system.get(id);
      let unsubscribe = initial ? trailActor(initial, onStateChange) : () => {};

      receive((event) => {
        if (event.type === 'TRAIL_NEW_PLUGIN') {
          unsubscribe();
          const plugin = system.get(event.id);
          unsubscribe = plugin ? trailActor(plugin, onStateChange) : () => {};
        }
      });

      return () => unsubscribe();
    }),

    backendListener: fromCallback(({ system, sendBack }) => {
      console.log('connecting to backend');

      // Check if backend already failed before we started listening (race condition fix)
      window.electronAPI?.apiStatus?.getStatus().then((status) => {
        if (status.error && !status.running && status.restartAttempts >= 3) {
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
        if (event.type === 'api:stopped' && (event as any).restarting) return; // Restart in progress
        if (event.type === 'api:fatal') {
          const { message, stack, source } = event as any;
          sendBack({
            type: 'BACKEND_ERROR',
            error: stack ? `[${source}] ${message}\n\n${stack}` : `[${source}] ${message}`,
          });
        } else if (event.type === 'api:stopped' || event.type === 'api:error') {
          const err = event.error as any;
          const errorDetail = err?.message || err || 'The backend process stopped unexpectedly.';
          const errorStack = err?.stack;
          sendBack({
            type: 'BACKEND_ERROR',
            error: errorStack ? `${errorDetail}\n\n${errorStack}` : errorDetail,
          });
        }
      });

      return () => {
        subscription.unsubscribe();
        cleanupApiStatus?.();
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

      // Validate plugin exists before persisting — stale IDs (e.g., removed plugins) must not overwrite localStorage
      const targetPlugin = context.plugins.find(p => p.id === lastActivePluginId);
      if (!targetPlugin) return;

      localStorage.setItem('agentbuddy-last-active-plugin', lastActivePluginId);

      if (targetPlugin.id !== context.activePlugin.id) {
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

    forwardNavToPlugin: ({ context, system, event }) => {
      system.get(context.activePlugin.id)?.send({ type: event.type as 'NAVIGATE_BACK' | 'NAVIGATE_FORWARD' });
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

      // Non-active plugins only receive their global hotkeys
      for (const plugin of context.plugins) {
        if (plugin.id === context.activePlugin.id) continue;
        const globalActions = plugin.hotkeys?.filter(h => h.global).map(h => h.action);
        if (globalActions?.length) {
          system.get(plugin.id).send({ ...hotkeyEvent, allowedActions: new Set(globalActions) });
        }
      }

      // Active plugin receives all hotkeys
      system.get(context.activePlugin.id).send(hotkeyEvent);
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
      const { pluginId, targetId, historyIndex } = typeOf('SELECT_PLUGIN', event) as any;
      const resolvedId = pluginId || targetId;
      const newPlugin = context.plugins.find(p => p.id === resolvedId) || context.activePlugin;

      // Un-expand chat when navigating to a plugin
      if (context.panelSizes.chatMaximized) {
        enqueue.assign(({ context }) => {
          const newSizes = { ...context.panelSizes, chatMaximized: false };
          localStorage.setItem('agentbuddy-panel-sizes', JSON.stringify(newSizes));
          return { panelSizes: newSizes };
        });
      }

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
        const sel = typeOf('SELECT_PLUGIN', event) as any;
        pluginId = sel.pluginId || sel.targetId;
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
    maximizeChat: assign(({ context }) => {
      const isCollapsed = context.panelSizes.canvasHeight >= 93;
      const newSizes = {
        ...context.panelSizes,
        chatMaximized: true,
        ...(isCollapsed ? { canvasHeight: 50 } : {}),
      };
      localStorage.setItem('agentbuddy-panel-sizes', JSON.stringify(newSizes));
      return { panelSizes: newSizes };
    }),
    restoreChat: assign(({ context }) => {
      const newSizes = { ...context.panelSizes, chatMaximized: false };
      localStorage.setItem('agentbuddy-panel-sizes', JSON.stringify(newSizes));
      return { panelSizes: newSizes };
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
    closeDevLetter: ({ self }) => {
      self.send({ type: 'SELECT_PLUGIN', pluginId: 'threads' });
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
      chatMaximized: false,
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
  initial: 'running',
  entry: [
    'spawnPluginActors',
    ({ context, system }) => {
      // Send initial activation to the active plugin
      system.get(context.activePlugin.id).send({ type: 'PLUGIN_ACTIVATED' });
    },
    'trailActivePlugin',
    spawnChild('hotkeyListener', { id: 'hotkeyListener' }),
    spawnChild('mouseListener', { id: 'mouseListener' }),
    spawnChild('backendListener'),
  ],
  states: {
    'onboarding': {
      tags: ['onboarding'],
      entry: assign({
        panelSizes: ({ context }) => ({ ...context.panelSizes, chatMaximized: true }),
      }),
      on: {
        ONBOARDING_COMPLETE: {
          actions: 'restoreChat',
          target: '#application.running.connected',
        },
      },
      initial: 'letter',
      states: {
        'letter': {
          tags: ['welcome'],
          on: {
            CLOSE_DEV_LETTER: {
              actions: 'closeDevLetter',
              target: 'wizard',
            },
          },
        },
        'wizard': {},
      },
    },
    'running': {
      tags: ['running'],
      initial: 'connecting',
      on: {
        RESTORE_CHAT: { actions: 'restoreChat' },
      },
      states: {
        'connecting': {
          tags: ['connecting'],
          after: {
            30000: {
              target: '#application.error',
              actions: () => {
                window.electronAPI?.apiStatus?.getStatus()
                  .then((status) => {
                    const details = [
                      'The backend did not respond within 30 seconds.',
                      '',
                      `Startup ID: ${status.startupId || window.electronAPI?.startupId || 'unknown'}`,
                      `API running: ${status.running ? 'yes' : 'no'}`,
                      `API port: ${status.port ?? 'unknown'}`,
                      `Restart attempts: ${status.restartAttempts}`,
                      status.error ? `Last backend error: ${typeof status.error === 'string' ? status.error : status.error.message}` : undefined,
                      '',
                      `Main log: ${status.logPath}`,
                      `Renderer log: ${status.rendererLogPath}`,
                      `App events log: ${status.appEventsLogPath}`,
                    ].filter(Boolean).join('\n');

                    window.__showErrorPage?.('Unable to connect', details);
                  })
                  .catch(() => {
                    window.__showErrorPage?.(
                      'Unable to connect',
                      'The backend did not respond within 30 seconds and API status could not be read.'
                    );
                  });
              }
            }
          },
          on: {
            CLIENT_CONNECTED: [
              {
                target: '#application.onboarding.letter',
                guard: ({ event }) => (event as any).hasOnboarded === false,
              },
              { target: 'connected' },
            ],
          },
        },
        'connected': {
          on: {
            // Handle backend reconnections (e.g. after crash + restart)
            CLIENT_CONNECTED: {
              target: 'connected',
              reenter: true,
            },
          },
        },
        'disconnected': {},
      }
    },
    'error': {},
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
    MAXIMIZE_CHAT: {
      actions: 'maximizeChat'
    },
    RESTORE_CHAT: {
      actions: 'restoreChat'
    },
    SWITCH_PLUGIN_UP: {
      actions: 'switchPluginByDirection'
    },
    SWITCH_PLUGIN_DOWN: {
      actions: 'switchPluginByDirection'
    },
    NAVIGATE_BACK: {
      actions: 'forwardNavToPlugin'
    },
    NAVIGATE_FORWARD: {
      actions: 'forwardNavToPlugin'
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
        window.__showErrorPage?.('Something went wrong', (event as any).error);
      }
    },
    SYSTEM_ERROR: {
      actions: ({ event }) => {
        const ev = typeOf('SYSTEM_ERROR', event);
        if (ev.severity === 'fatal') {
          window.__showErrorPage?.(
            ev.title ?? 'Something went wrong',
            ev.stack ? `${ev.message}\n\n${ev.stack}` : ev.message,
          );
          return;
        }

        globalToast.error(ev.title ?? 'Something went wrong', ev.message);
      },
    },
    NOOP: {
      // No-op event, do nothing
    },
  }
});
