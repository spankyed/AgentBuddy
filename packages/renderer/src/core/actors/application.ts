import { assign, setup, enqueueActions, fromCallback, spawnChild, sendTo, type ActorRefFrom } from 'xstate';
import type { Plugin } from '@/core/types';
import type { HotkeyEvent, ContextMenuItem } from '@abuddy/sdk/fe';
import type { Message } from '@abuddy/sdk/events';
import { processHotkeys, safeEvents } from '@abuddy/sdk/fe';
import type { ApplicationHotkeys } from '@abuddy/sdk/types';
import { trpc, reconnectApiClient } from '@/core/trpc';
import trailActor, { computeCrumbs, type UpdateData } from '@/core/actors/route-trailer';
import { globalToast } from '@/core/toast';
import { getDesignated } from '@abuddy/sdk/fe';
import { resolveName } from '@abuddy/sdk/ids';
import { loadPackFrontend, unloadPackFrontend } from '@/packs/pack-loader';


declare global {
  interface Window {
    /** Shows the error page index.html defines */
    __showErrorPage?: (title: string, detail: string) => void;
  }
}

interface BreadcrumbItem {
  label: string;
  target: string;
  info?: any;
}

export interface ApplicationParams {
  plugins: Plugin[];
  defaultPlugin: Plugin;
  initialPluginId?: string;
  restoreLastActivePlugin?: boolean;
}

export interface ApplicationContext {
  defaultToggles: {
    canvas: boolean;
  },
  activePlugin: Plugin;
  defaultPlugin: Plugin;
  plugins: Plugin[];
  visiblePlugins: Plugin[]; // Filtered list of visible plugins
  pluginVisibility: Record<string, boolean>; // Which tabs show, the host's (AppState)
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
  restoreLastActivePlugin: boolean;
  /**
   * A plugin to open that isn't registered yet: the one a popout opens on, or the one last open, when an external
   * pack's frontend adds it after this window starts. Opened when its pack's plugins arrive, unless the user has
   * opened another plugin by then.
   */
  pendingPluginId: string | null;
  /**
   * Each external pack whose frontend load finished, by pack id, with the plugins it added: not those
   * skipped because a plugin had the id already, and none when its frontend exported none or failed to load
   */
  packPluginIds: Record<string, string[]>;
  /** Whether this window's bus subscription is established; it reconnects after the connection drops */
  busSubscribed: boolean;
  /** Whether the pack frontend loader is running: one run at a time, so a pack is never loaded twice */
  packLoadRunning: boolean;
  /** A load was asked for while one was running — the list it read may predate the request — so it runs again */
  packLoadQueued: boolean;
  /**
   * Every pack the loader has finished with, whatever its frontend added — plugins, styles alone, or
   * nothing — so it's never loaded twice. A pack unloaded drops out and loads again when it comes back.
   */
  packFrontendsLoaded: string[];
  /** Packs unloaded while the loader was running: a result that arrives for one of them is dropped */
  packsUnloadedWhileLoading: string[];
  /** Whether the loaded packs were ever read: until it is, a failed read is worth telling the user about */
  loadedPacksRead: boolean;
}

/** The application actor's system id: the host's `application` plugin, which pack systems send to */
export const application = 'host/application' as const;

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
  | { type: 'SET_PLUGIN_VISIBILITY'; pluginId: string; visible: boolean }
  | { type: 'CLIENT_CONNECTED'; hasOnboarded: boolean; pluginVisibility: Record<string, boolean>; lastActivePlugin?: string }
  | { type: 'CLOSE_DEV_LETTER' }
  | { type: 'ONBOARDING_COMPLETE' }
  | { type: 'SHOW_INSPECTION_PANEL' }
  | { type: 'HIDE_INSPECTION_PANEL' }
  | { type: 'RESET_CHAT_HEIGHT' }
  | { type: 'SYSTEM_ERROR'; errorId?: string; title?: string; message: string; source?: string; operation?: string; entityId?: string; severity?: 'diagnostic' | 'error' | 'fatal'; stack?: string; timestamp?: number }
  | { type: 'BACKEND_ERROR'; error: string | { message: string; stack?: string } }
  | { type: 'BUS_SUBSCRIBED' }
  | { type: 'BUS_CONNECTION_LOST' }
  /** Load the frontends of the external packs this window hasn't loaded: on connecting, and when a pack activates */
  | { type: 'LOAD_PACK_FRONTENDS' }
  /**
   * The loader finished: `loadedPacksError` is why the loaded packs couldn't be read, when they couldn't,
   * and `failedPacks` the packs that threw while loading, which that read reached
   */
  | { type: 'PACK_FRONTENDS_SETTLED'; loadedPacksError?: string; failedPacks?: { packId: string; error: string }[] }
  /**
   * A pack's frontend load finished, with the plugins it exports: none when it failed to load, and null
   * for a pack without frontend code, which is recorded as loaded and asked for nothing
   */
  | { type: 'PACK_FRONTEND_LOADED'; packId: string; plugins: Plugin[] | null }
  | { type: 'PACK_PLUGINS_UNLOADED'; packId: string }
  | { type: 'NOOP' }

const typeOf = safeEvents<ApplicationEvent>();

/**
 * Spawns a plugin's state machine under its own id as well as its system id. The id is the key this actor
 * tracks the child by: without one every plugin shares a key, this actor holds only the last one spawned,
 * and stopping it stops that one alone while the rest keep running with their system ids taken.
 *
 * XState types `id` from the declared children, and plugins are registered at runtime (built-in and from
 * packs), so the id goes through this one cast rather than at each call site.
 */
function spawnPluginActor(enqueue: unknown, plugin: Plugin): void {
  const spawner = enqueue as { spawnChild(state: Plugin['state'], options: { id: string; systemId: string }): void };
  spawner.spawnChild(plugin.state, { id: plugin.id, systemId: plugin.id });
}

/**
 * Asks a pack's systems for their startup data. A connection's CLIENT_CONNECTED skips the systems of
 * external packs with frontend code, which loads after it; each is asked for once its load finished,
 * whether it added plugins or not, so its systems without plugins get it too.
 */
function announcePackClientReady(packId: string) {
  trpc.bus.packClientReady.mutate({ packId }).catch((err: unknown) => {
    console.warn(`[pack-loader] Couldn't request startup data for pack ${packId}:`, err);
  });
}

const packFrontendLoaderId = 'packFrontendLoader';

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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

    /**
     * Reads the loaded packs and loads the frontend of every external pack in it this window hasn't
     * loaded yet, reporting each one to the parent as it finishes. A failed query leaves the
     * packs unloaded: the parent runs the loader again whenever the bus subscription is established, so
     * the next connection picks them up. One pack that throws doesn't stop the others; it's reported as
     * its own failure, since the loaded packs were read and only that pack is missing.
     */
    packFrontendLoader: fromCallback<{ type: string }, { loadedPackIds: string[] }>(({ sendBack, input }) => {
      let stopped = false;
      const failedPacks: { packId: string; error: string }[] = [];

      trpc.packs.loaded.query().then(async (loadedPacks) => {
        for (const pack of loadedPacks) {
          if (stopped) return;
          if (pack.builtIn || input.loadedPackIds.includes(pack.id)) continue;
          try {
            // null: the pack has no frontend code, so there's nothing to merge or ask startup data for
            const plugins = await loadPackFrontend(pack);
            if (stopped) return;
            sendBack({ type: 'PACK_FRONTEND_LOADED', packId: pack.id, plugins });
          } catch (err: unknown) {
            if (stopped) return;
            failedPacks.push({ packId: pack.id, error: messageOf(err) });
            // Reported as loaded with nothing, like a frontend that failed to import: its systems are
            // asked for their startup data and the loader doesn't come back to it
            sendBack({ type: 'PACK_FRONTEND_LOADED', packId: pack.id, plugins: [] });
          }
        }
        if (!stopped) sendBack({ type: 'PACK_FRONTENDS_SETTLED', failedPacks });
      }).catch((err: unknown) => {
        if (!stopped) sendBack({ type: 'PACK_FRONTENDS_SETTLED', loadedPacksError: messageOf(err), failedPacks });
      });

      return () => { stopped = true; };
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

      const subscribeToBus = () => trpc.bus.sub.subscribe(
        undefined,
        {
          // Each time this window's subscription is established: the server has sent this connection's
          // CLIENT_CONNECTED. Another window connecting broadcasts CLIENT_CONNECTED too, but not this.
          onStarted: () => sendBack({ type: 'BUS_SUBSCRIBED' }),
          // The socket dropped: the subscription is established again when it reconnects
          onConnectionStateChange: ({ state }) => {
            if (state === 'connecting') sendBack({ type: 'BUS_CONNECTION_LOST' });
          },
          onError: (error: any) => {
            console.error('Error in subscription:', error);
            sendBack({ type: 'BACKEND_ERROR', error: String(error) });
          },
          // Each message says which plugin it is for; the event is delivered exactly as the system sent it
          onData: ({ to, event }: Message) => {
            if (to === application) {
              sendBack(event as ApplicationEvent);
            } else {
              const pluginActor = system.get(to);
              if (pluginActor) {
                pluginActor.send(event);
              } else {
                console.warn(`[Backend] Plugin actor not found for ID: ${to}`, event);
              }
            }
          },
        }
      );

      let subscription = subscribeToBus();

      // Listen for Electron IPC crash notifications (instant detection)
      const cleanupApiStatus = window.electronAPI?.apiStatus?.onEvent((event) => {
        if (event.type === 'api:stopped' && (event as any).restarting) return; // Restart in progress
        if (event.type === 'api:started') {
          // A restart can land on a different port; the old subscription died with the old socket
          if (event.port && reconnectApiClient(event.port)) {
            subscription.unsubscribe();
            subscription = subscribeToBus();
          }
          return;
        }
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

    mergePackPlugins: enqueueActions(({ event, context, enqueue }) => {
      const { packId, plugins: packPlugins } = typeOf('PACK_FRONTEND_LOADED', event);

      // The pack was unloaded while its frontend was loading: keep its plugins out, since nothing would
      // ever take them out again, and undo what the load registered
      if (context.packsUnloadedWhileLoading.includes(packId)) {
        enqueue.assign({ packsUnloadedWhileLoading: context.packsUnloadedWhileLoading.filter(id => id !== packId) });
        enqueue(() => unloadPackFrontend(packId));
        return;
      }

      const packFrontendsLoaded = context.packFrontendsLoaded.includes(packId)
        ? context.packFrontendsLoaded
        : [...context.packFrontendsLoaded, packId];

      // A pack without frontend code contributes nothing and needs no startup data: the connection's
      // CLIENT_CONNECTED reached its systems already
      if (packPlugins === null) {
        enqueue.assign({ packFrontendsLoaded });
        return;
      }

      const existingIds = new Set(context.plugins.map(p => p.id));
      const skipped = packPlugins.filter(p => existingIds.has(p.id));
      if (skipped.length > 0) {
        console.warn(`[pack-loader] Skipping plugins with duplicate IDs: ${skipped.map(p => p.id).join(', ')}`);
      }
      const newPlugins = packPlugins.filter(p => !existingIds.has(p.id));
      const packPluginIds = {
        ...context.packPluginIds,
        [packId]: [...(context.packPluginIds[packId] ?? []), ...newPlugins.map(p => p.id)],
      };
      if (newPlugins.length === 0) {
        enqueue.assign({ packPluginIds, packFrontendsLoaded });
      } else {
        const packsIdx = context.plugins.findIndex(p => p.id === resolveName('host/packs'));
        const allPlugins = packsIdx >= 0
          ? [...context.plugins.slice(0, packsIdx), ...newPlugins, ...context.plugins.slice(packsIdx)]
          : [...context.plugins, ...newPlugins];
        // Visibility is the host's (AppState, sent on each connection); unset shows the plugin
        enqueue.assign({
          plugins: allPlugins,
          visiblePlugins: allPlugins.filter(p => context.pluginVisibility[p.id] !== false),
          packPluginIds,
          packFrontendsLoaded,
        });
        for (const plugin of newPlugins) {
          spawnPluginActor(enqueue, plugin);
        }
        const pending = context.pendingPluginId;
        if (pending && newPlugins.some((p) => p.id === pending)) {
          enqueue.raise({ type: 'SELECT_PLUGIN', pluginId: pending });
        }
      }
      // The pack's plugin actors, if any, now exist: its systems send their startup data. Before this
      // window's subscription is established, announceLoadedPacks asks for it once it is.
      if (context.busSubscribed) enqueue(() => announcePackClientReady(packId));
    }),

    // This window's subscription (re)connected: its CLIENT_CONNECTED skipped the packs whose frontends load after it
    announceLoadedPacks: ({ context }) => {
      for (const packId of Object.keys(context.packPluginIds)) announcePackClientReady(packId);
    },

    /** Runs the pack frontend loader, or queues a run when one is under way */
    loadPackFrontends: enqueueActions(({ context, enqueue }) => {
      if (context.packLoadRunning) {
        enqueue.assign({ packLoadQueued: true });
        return;
      }
      enqueue.assign({ packLoadRunning: true, packLoadQueued: false });
      enqueue.spawnChild('packFrontendLoader', {
        id: packFrontendLoaderId,
        input: { loadedPackIds: context.packFrontendsLoaded },
      });
    }),

    /** The loader finished: run it again when a load was asked for meanwhile, and report what failed */
    onPackFrontendsSettled: enqueueActions(({ context, event, enqueue }) => {
      const { loadedPacksError, failedPacks } = typeOf('PACK_FRONTENDS_SETTLED', event);
      enqueue.stopChild(packFrontendLoaderId);

      // Every result of the run that finished has arrived, so nothing is left to drop
      if (context.packsUnloadedWhileLoading.length > 0) enqueue.assign({ packsUnloadedWhileLoading: [] });

      if (context.packLoadQueued) {
        enqueue.assign({ packLoadQueued: false });
        enqueue.spawnChild('packFrontendLoader', {
          id: packFrontendLoaderId,
          // The packs this run loaded are in context already: the loader sends its results before settling
          input: { loadedPackIds: context.packFrontendsLoaded },
        });
      } else {
        enqueue.assign({ packLoadRunning: false });
      }

      if (loadedPacksError) {
        // The next connection runs the loader again, so a read that fails while the API restarts repairs
        // itself; the user hears about it only while no pack has ever loaded
        const firstRead = !context.loadedPacksRead;
        enqueue(() => {
          console.warn('[pack-loader] Failed to read the loaded packs:', loadedPacksError);
          if (firstRead) globalToast.error("Add-on packs couldn't be loaded", loadedPacksError);
        });
      } else if (!context.loadedPacksRead) {
        enqueue.assign({ loadedPacksRead: true });
      }

      if (failedPacks?.length) {
        // The loaded packs were read: these packs alone are missing, and the loader won't come back to them
        const names = failedPacks.map(p => p.packId).join(', ');
        const details = failedPacks.map(p => `${p.packId}: ${p.error}`).join('\n');
        enqueue(() => {
          console.warn(`[pack-loader] Failed to load the frontend of ${names}:\n${details}`);
          globalToast.error(`Couldn't load ${names}`, failedPacks.map(p => p.error).join('\n'));
        });
      }
    }),

    removePackPlugins: enqueueActions(({ event, context, system, enqueue }) => {
      const { packId } = typeOf('PACK_PLUGINS_UNLOADED', event);
      const pluginIds = context.packPluginIds[packId];

      // The pack loads again when it comes back
      if (context.packFrontendsLoaded.includes(packId)) {
        enqueue.assign({ packFrontendsLoaded: context.packFrontendsLoaded.filter(id => id !== packId) });
      } else if (context.packLoadRunning && !context.packsUnloadedWhileLoading.includes(packId)) {
        // It's being loaded right now: its result is dropped instead of adding plugins nothing removes
        enqueue.assign({ packsUnloadedWhileLoading: [...context.packsUnloadedWhileLoading, packId] });
      }

      if (!pluginIds) return;
      const removeSet = new Set(pluginIds);

      const remaining = context.plugins.filter(p => !removeSet.has(p.id));
      const pluginVisibility = { ...context.pluginVisibility };
      for (const id of pluginIds) delete pluginVisibility[id];

      const needsNavigate = removeSet.has(context.activePlugin.id);
      const activePlugin = needsNavigate ? (remaining[0] ?? context.defaultPlugin) : context.activePlugin;

      // Plugin children are spawned by system id only, so stop them by reference
      for (const id of pluginIds) {
        const plugin = system.get(id);
        if (plugin) enqueue.stopChild(plugin);
      }

      const packPluginIds = { ...context.packPluginIds };
      delete packPluginIds[packId];
      enqueue.assign({
        plugins: remaining,
        visiblePlugins: remaining.filter(p => pluginVisibility[p.id] !== false),
        pluginVisibility,
        activePlugin,
        packPluginIds,
      });

      if (needsNavigate) {
        enqueue(({ system }) => {
          system.get(activePlugin.id)?.send({ type: 'PLUGIN_ACTIVATED' });
        });
      }
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

    /**
     * The shell's state the backend sends on each connection (the host `application` system's, in AppState): which
     * plugins' tabs show, and the plugin the user last had open, which a main window opens on once it's registered.
     */
    applyShellState: enqueueActions(({ event, context, enqueue, self }) => {
      const { pluginVisibility, lastActivePlugin } = typeOf('CLIENT_CONNECTED', event);
      enqueue.assign({
        pluginVisibility,
        visiblePlugins: context.plugins.filter((plugin) => pluginVisibility[plugin.id] !== false),
      });
      if (!context.restoreLastActivePlugin || !lastActivePlugin || lastActivePlugin === context.activePlugin.id) return;
      if (context.plugins.some((p) => p.id === lastActivePlugin)) {
        enqueue(() => self.send({ type: 'SELECT_PLUGIN', pluginId: lastActivePlugin }));
      } else {
        enqueue.assign({ pendingPluginId: lastActivePlugin });
      }
    }),

    /** A tab shown or hidden here: shown at once, and recorded by the host so every window and the next run agree */
    setPluginVisibility: enqueueActions(({ event, context, enqueue }) => {
      const { pluginId, visible } = typeOf('SET_PLUGIN_VISIBILITY', event);
      const pluginVisibility = { ...context.pluginVisibility, [pluginId]: visible };
      enqueue.assign({
        pluginVisibility,
        visiblePlugins: context.plugins.filter((plugin) => pluginVisibility[plugin.id] !== false),
      });
      enqueue(() => {
        trpc.bus.send.mutate({ to: application, event: { type: 'SET_PLUGIN_VISIBILITY', pluginId, visible } })
          .catch((error) => console.error('[application] Could not record the plugin visibility:', error));
      });
    }),

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
      // Opening a plugin settles which one this window shows
      if (context.pendingPluginId) enqueue.assign({ pendingPluginId: null });

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
        enqueue(() => {
          // The host records it, so the next window, and the next run, opens on it
          trpc.bus.send.mutate({ to: application, event: { type: 'SET_LAST_ACTIVE_PLUGIN', pluginId: newPlugin.id } })
            .catch((error) => console.error('[application] Could not record the last active plugin:', error));
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
        spawnPluginActor(enqueue, plugin);
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
      self.send({ type: 'SELECT_PLUGIN', pluginId: getDesignated('threads') });
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
  id: 'application',
  context: ({ input }) => {
    // Load saved panel sizes from localStorage or use defaults
    const savedSizes = localStorage.getItem('agentbuddy-panel-sizes');
    const defaultSizes = {
      canvasHeight: 50, // 50% of main area
      inspectionWidth: 448, // 28rem = 448px (16px base),
      chatMaximized: false,
    };
    const panelSizes = savedSizes ? { ...defaultSizes, ...JSON.parse(savedSizes) } : defaultSizes;

    // Initialize with all plugins visible by default
    const pluginVisibility: Record<string, boolean> = {};
    input.plugins.forEach(plugin => {
      pluginVisibility[plugin.id] = true;
    });

    // A popout opens on its plugin (once its pack's frontend adds it, if an external pack's); a main window on the
    // first, until the host says which was last open
    const initialPlugin = input.plugins.find((p) => p.id === input.initialPluginId);
    const initialActivePlugin = initialPlugin ?? input.plugins[0];

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
      restoreLastActivePlugin: input.restoreLastActivePlugin ?? true,
      pendingPluginId: initialPlugin ? null : input.initialPluginId ?? null,
      packPluginIds: {},
      busSubscribed: false,
      packLoadRunning: false,
      packLoadQueued: false,
      packFrontendsLoaded: [],
      packsUnloadedWhileLoading: [],
      loadedPacksRead: false,
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
    spawnChild('backendListener', { id: 'backendListener' }),
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
                actions: 'applyShellState',
              },
              { target: 'connected', actions: 'applyShellState' },
            ],
          },
        },
        'connected': {
          on: {
            // Handle backend reconnections (e.g. after crash + restart)
            CLIENT_CONNECTED: {
              target: 'connected',
              reenter: true,
              actions: 'applyShellState',
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
    // In every state: onboarding and the error page keep pack systems' startup data flowing too.
    // The loader runs on every establishment of the subscription, so packs a failed query left
    // unloaded are picked up by the next one.
    BUS_SUBSCRIBED: {
      actions: [assign({ busSubscribed: true }), 'announceLoadedPacks', 'loadPackFrontends'],
    },
    BUS_CONNECTION_LOST: {
      actions: assign({ busSubscribed: false }),
    },
    LOAD_PACK_FRONTENDS: {
      actions: 'loadPackFrontends'
    },
    PACK_FRONTENDS_SETTLED: {
      actions: 'onPackFrontendsSettled'
    },
    PACK_FRONTEND_LOADED: {
      actions: 'mergePackPlugins'
    },
    PACK_PLUGINS_UNLOADED: {
      actions: 'removePackPlugins'
    },
    PLUGIN_VISIBILITY_UPDATED: {
      actions: 'updatePluginVisibility'
    },
    SET_PLUGIN_VISIBILITY: {
      actions: 'setPluginVisibility'
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
        // A diagnostic is for whoever is building the app or a pack, and it is already in the Logs
        // plugin. Interrupting the person using the app with it tells them nothing they can act on.
        if (ev.severity === 'diagnostic') return;
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
