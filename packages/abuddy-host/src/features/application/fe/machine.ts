// The app shell: the host `application` feature's plugin, which runs every plugin's actor, holds which one is open,
// lays out the panels and loads external packs' frontends. Its I/O arrives as options (types.ts); the renderer
// composes it with the API client and the window, a pack's tests with fakes.
import { assign, enqueueActions, setup, sendTo, spawnChild } from 'xstate';
import { getDesignated, processHotkeys, safeEvents } from '@abuddy/sdk/fe';
import { splitRef } from '@abuddy/sdk/ids';
import { isPlainObject } from '@abuddy/sdk/utils/pure';
import type { HostShellEvent, HostShellState, PluginEvent, ShellPanelSizes } from '@abuddy/sdk/fe';
import { HOST } from '../../../refs.ts';
import { connectionListener } from './connection.ts';
import { hotkeyListener, mouseListener } from './input.ts';
import {
  chatMaximized, chatRestored, initialPanelSizes, inspectionToggled, resized,
} from './layout.ts';
import { announcePackClientReady, PACK_FRONTEND_LOADER_ID, packFrontendLoader } from './pack-frontends.ts';
import { historyAfter, neighbourOf, spawnPluginActor, withHostLast } from './plugins.ts';
import { computeCrumbs, pluginTrailer } from './trail.ts';
import type { ShellContext, ShellEvent, ShellOptions, ShellParams } from './types.ts';

const typeOf = safeEvents<ShellEvent>();

/**
 * Compiles only while the shell accepts every event the SDK's `HostShell` lets frontend code send, and holds the
 * state it lets frontend code read: a change to either side fails the typecheck here, not a pack at runtime.
 */
function satisfiesHostShell<_Contract extends [true, true]>(): void {}
satisfiesHostShell<[
  [HostShellEvent] extends [ShellEvent] ? true : false,
  ShellContext extends HostShellState ? true : false,
]>();

/** Whether external packs' frontends may still add plugins: the loaded packs not read yet, or a load running or queued */
function packFrontendsPending(context: ShellContext): boolean {
  return !context.loadedPacksRead || context.packLoadRunning || context.packLoadQueued;
}

/** The app shell over `options`, the I/O it's given */
export function createShellMachine({ packs, client, packFrontends, storage, notify, target }: ShellOptions) {
  /** Sizes the user chose, which the next window opens with; sizes set for the moment are assigned without it */
  const saved = (sizes: ShellPanelSizes): ShellPanelSizes => {
    storage.savePanelSizes(sizes);
    return sizes;
  };

  return setup({
    types: {
      context: {} as ShellContext,
      events: {} as ShellEvent,
      input: {} as ShellParams,
    },
    actors: {
      hotkeyListener: hotkeyListener(target),
      mouseListener: mouseListener(target),
      connectionListener: connectionListener(client),
      packFrontendLoader: packFrontendLoader(client, packFrontends),
      pluginTrailer,
    },
    actions: {
      updateHotkeys: assign(({ event }) => ({ hotkeys: typeOf('APPLICATION_HOTKEYS', event).hotkeys })),

      mergePackPlugins: enqueueActions(({ event, context, enqueue }) => {
        const { packId, plugins: packPlugins } = typeOf('PACK_FRONTEND_LOADED', event);

        // The pack was unloaded while its frontend was loading: keep its plugins out, since nothing would ever take
        // them out again, and undo what the load registered
        if (context.packsUnloadedWhileLoading.includes(packId)) {
          enqueue.assign({ packsUnloadedWhileLoading: context.packsUnloadedWhileLoading.filter(id => id !== packId) });
          enqueue(() => packFrontends.unload(packId));
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

        // A plugin's id is its feature's ref, `<packId>/<featureId>`: a pack can't name a plugin in another pack's
        // namespace, and a pack the loader finished is in `packFrontendsLoaded`, so these ids are this window's first
        const newPlugins = packPlugins;
        const packsWithFrontend = context.packsWithFrontend.includes(packId)
          ? context.packsWithFrontend
          : [...context.packsWithFrontend, packId];
        if (newPlugins.length === 0) {
          enqueue.assign({ packFrontendsLoaded, packsWithFrontend });
        } else {
          // Visibility is the host's (AppState, sent on each connection); unset shows the plugin
          enqueue.assign({ plugins: withHostLast([...context.plugins, ...newPlugins]), packFrontendsLoaded, packsWithFrontend });
          for (const plugin of newPlugins) spawnPluginActor(enqueue, plugin);
          const added = new Set<string>(newPlugins.map((p) => p.id));
          const pending = context.pendingPluginId;
          if (pending && added.has(pending)) enqueue.raise({ type: 'SELECT_PLUGIN', plugin: pending });
          // Plugins asked to open while their pack loaded open now, with their events
          const arrived = context.awaitingPlugin.filter((work) => added.has(work.plugin));
          if (arrived.length > 0) {
            enqueue.assign({ awaitingPlugin: context.awaitingPlugin.filter((work) => !added.has(work.plugin)) });
            // `select` is what the wait was for: an open selects the plugin, a send only hands it its events
            for (const { plugin, events, select } of arrived) enqueue.raise({ type: select ? 'OPEN_PLUGIN' : 'SEND_TO_PLUGIN', plugin, events });
          }
        }
        // The pack's plugin actors, if any, now exist: its systems send their startup data. Before this window's
        // subscription is established, announceLoadedPacks asks for it once it is.
        if (context.busSubscribed) enqueue(() => announcePackClientReady(client, packId));
      }),

      // This window's subscription (re)connected: its CLIENT_CONNECTED skipped the packs whose frontends load after
      // it, whatever the frontend turned out to add — a pack that exported no plugin has systems waiting too
      announceLoadedPacks: ({ context }) => {
        for (const packId of context.packsWithFrontend) announcePackClientReady(client, packId);
      },

      /** Runs the pack frontend loader, or queues a run when one is under way */
      loadPackFrontends: enqueueActions(({ context, enqueue }) => {
        if (context.packLoadRunning) {
          enqueue.assign({ packLoadQueued: true });
          return;
        }
        enqueue.assign({ packLoadRunning: true, packLoadQueued: false });
        enqueue.spawnChild('packFrontendLoader', { id: PACK_FRONTEND_LOADER_ID, input: { loadedPackIds: context.packFrontendsLoaded } });
      }),

      /** The loader finished: run it again when a load was asked for meanwhile, and report what failed */
      onPackFrontendsSettled: enqueueActions(({ context, event, enqueue }) => {
        const { loadedPacksError, failedPacks } = typeOf('PACK_FRONTENDS_SETTLED', event);
        enqueue.stopChild(PACK_FRONTEND_LOADER_ID);

        // Every result of the run that finished has arrived, so nothing is left to drop
        if (context.packsUnloadedWhileLoading.length > 0) enqueue.assign({ packsUnloadedWhileLoading: [] });

        if (context.packLoadQueued) {
          enqueue.assign({ packLoadQueued: false });
          // The packs this run loaded are in context already: the loader sends its results before settling
          enqueue.spawnChild('packFrontendLoader', { id: PACK_FRONTEND_LOADER_ID, input: { loadedPackIds: context.packFrontendsLoaded } });
        } else {
          enqueue.assign({ packLoadRunning: false });
          // Loading has settled: a plugin still asked for is one no loaded pack provides
          if (context.awaitingPlugin.length > 0) {
            // `assign` replaces the array rather than mutating it, so the reference stays valid in the deferred enqueue
        const refused = context.awaitingPlugin;
            enqueue.assign({ awaitingPlugin: [] });
            enqueue(() => {
              for (const { plugin, select } of refused) {
                notify.error(`Couldn't ${select ? 'open' : 'reach'} ${plugin}`, `No plugin is registered at "${plugin}"`);
              }
            });
          }
        }

        if (loadedPacksError) {
          // The next connection runs the loader again, so a read that fails while the API restarts repairs
          // itself; the user hears about it only while no pack has ever loaded
          const firstRead = !context.loadedPacksRead;
          enqueue(() => {
            console.warn('[shell] Failed to read the loaded packs:', loadedPacksError);
            if (firstRead) notify.error("Add-on packs couldn't be loaded", loadedPacksError);
          });
        } else if (!context.loadedPacksRead) {
          enqueue.assign({ loadedPacksRead: true });
        }

        if (failedPacks?.length) {
          // The loaded packs were read: these packs alone are missing, and the loader won't come back to them
          const names = failedPacks.map(p => p.packId).join(', ');
          const details = failedPacks.map(p => `${p.packId}: ${p.error}`).join('\n');
          enqueue(() => {
            console.warn(`[shell] Failed to load the frontend of ${names}:\n${details}`);
            notify.error(`Couldn't load ${names}`, failedPacks.map(p => p.error).join('\n'));
          });
        }
      }),

      removePackPlugins: enqueueActions(({ event, context, system, enqueue }) => {
        const { packId } = typeOf('PACK_PLUGINS_UNLOADED', event);
        // A plugin runs under its feature's ref, `<packId>/<featureId>`, and a pack id holds no `/`, so the pack's
        // plugins are the ones this window has under that prefix. Matched rather than parsed: a plugin left here
        // because its id didn't parse would stay with nothing to take it out. Nothing else records them either — a
        // second copy could disagree with the plugins actually here, and miss the same way.
        const pluginIds = context.plugins.filter((p) => p.id.startsWith(`${packId}/`)).map((p) => p.id);

        // The shell loads a pack's frontend and it unloads it: the Packs plugin says the pack is gone, and what
        // that means for this window — the registrations, the stylesheets, the plugins below — is decided here
        enqueue(() => packFrontends.unload(packId));

        // The pack loads again when it comes back
        if (context.packsWithFrontend.includes(packId)) {
          enqueue.assign({ packsWithFrontend: context.packsWithFrontend.filter(id => id !== packId) });
        }
        if (context.packFrontendsLoaded.includes(packId)) {
          enqueue.assign({ packFrontendsLoaded: context.packFrontendsLoaded.filter(id => id !== packId) });
        } else if (context.packLoadRunning && !context.packsUnloadedWhileLoading.includes(packId)) {
          // It's being loaded right now: its result is dropped instead of adding plugins nothing removes
          enqueue.assign({ packsUnloadedWhileLoading: [...context.packsUnloadedWhileLoading, packId] });
        }
        // A plugin asked to open from a pack that's gone won't arrive
        if (context.awaitingPlugin.some((work) => splitRef(work.plugin)?.packId === packId)) {
          enqueue.assign({ awaitingPlugin: context.awaitingPlugin.filter((work) => splitRef(work.plugin)?.packId !== packId) });
        }

        if (pluginIds.length === 0) return;
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

        enqueue.assign({ plugins: remaining, pluginVisibility, activePlugin });

        if (needsNavigate) {
          enqueue(({ system }) => {
            system.get(activePlugin.id)?.send({ type: 'PLUGIN_ACTIVATED' });
          });
        }
      }),

      updatePluginVisibility: assign(({ event }) => ({ pluginVisibility: typeOf('PLUGIN_VISIBILITY_UPDATED', event).pluginVisibility })),

      /**
       * The shell's state the backend sends on each connection (the host `application` system's, in AppState): which
       * plugins' tabs show, and the plugin the user last had open, which a main window opens on once it's registered.
       */
      applyShellState: enqueueActions(({ event, context, enqueue, self }) => {
        const { pluginVisibility, lastActivePlugin } = typeOf('CLIENT_CONNECTED', event);
        enqueue.assign({ pluginVisibility });
        if (!context.ownsLastActivePlugin || !lastActivePlugin || lastActivePlugin === context.activePlugin.id) return;
        if (context.plugins.some((p) => p.id === lastActivePlugin)) {
          enqueue(() => self.send({ type: 'SELECT_PLUGIN', plugin: lastActivePlugin }));
        } else {
          enqueue.assign({ pendingPluginId: lastActivePlugin });
        }
      }),

      /** A tab shown or hidden here: shown at once, and recorded by the host so every window and the next run agree */
      setPluginVisibility: enqueueActions(({ event, context, enqueue }) => {
        const { plugin, visible } = typeOf('SET_PLUGIN_VISIBILITY', event);
        enqueue.assign({ pluginVisibility: { ...context.pluginVisibility, [plugin]: visible } });
        enqueue(() => client.send({ to: HOST.application, event: { type: 'SET_PLUGIN_VISIBILITY', plugin, visible } }));
      }),

      /**
       * Opens a plugin and hands it events. A plugin that isn't registered waits while pack frontends may still add
       * it, and is refused once loading has settled (onPackFrontendsSettled).
       *
       * `do` because `openPlugin` is also the SDK function that sends this action's event (`@abuddy/sdk/fe`), so a
       * mention of it in this file would read as either. Its neighbours don't carry the prefix and don't need it:
       * nothing else is named `sendToPlugin` or `openPluginFromApp`.
       */
      doOpenPlugin: enqueueActions(({ context, event, enqueue }) => {
        const { plugin, events } = typeOf('OPEN_PLUGIN', event);
        if (!context.plugins.some((p) => p.id === plugin)) {
          if (packFrontendsPending(context)) {
            enqueue.assign({ awaitingPlugin: [...context.awaitingPlugin, { plugin, events, select: true }] });
          } else {
            enqueue(() => notify.error(`Couldn't open ${plugin}`, `No plugin is registered at "${plugin}"`));
          }
          return;
        }
        if (context.activePlugin.id !== plugin) enqueue.raise({ type: 'SELECT_PLUGIN', plugin });
        if (context.defaultToggles.canvas) enqueue.raise({ type: 'DEFAULT_TOGGLE', area: 'canvas' });
        // Sent, not raised: it's handled after this step settles, so the plugin is open, as the shell's state reads,
        // when its events arrive
        if (events.length > 0) enqueue(({ self }) => self.send({ type: 'DELIVER_PLUGIN_EVENTS', plugin, events }));
      }),

      /**
       * Hands a plugin its events without opening it — the renderer's `sendToPlugin`. The same wait as `doOpenPlugin`,
       * and deliberately not the same ending: a send that stole the user's canvas would make every cross-feature
       * command a navigation.
       */
      sendToPlugin: enqueueActions(({ context, event, enqueue }) => {
        const { plugin, events, from } = typeOf('SEND_TO_PLUGIN', event);
        if (!context.plugins.some((p) => p.id === plugin)) {
          if (packFrontendsPending(context)) {
            enqueue.assign({ awaitingPlugin: [...context.awaitingPlugin, { plugin, events, select: false }] });
          } else {
            // The sending pack, when the send stamped one (`defineEvents`); the host's own sends carry none
            const sender = from ? ` Sent by "${from}".` : '';
            enqueue(() => notify.error(`Couldn't reach ${plugin}`, `No plugin is registered at "${plugin}".${sender}`));
          }
          return;
        }
        if (events.length > 0) enqueue(({ self }) => self.send({ type: 'DELIVER_PLUGIN_EVENTS', plugin, events }));
      }),

      // A backend's request carries whatever the sending pack built: a payload that isn't a plugin and its events
      // would crash the plugin's actor, or this one, so it is refused here rather than delivered
      openPluginFromApp: enqueueActions(({ event, enqueue }) => {
        const { plugin, events = [] } = typeOf('OPEN_PLUGIN_FROM_APP', event);
        const deliverable = Array.isArray(events) && events.every((e) => isPlainObject(e) && typeof e.type === 'string');
        if (typeof plugin !== 'string' || !deliverable) {
          enqueue(() => notify.error("Couldn't open a plugin", `A pack asked the app to open "${String(plugin)}" with events it can't deliver`));
          return;
        }
        enqueue.raise({ type: 'OPEN_PLUGIN' as const, plugin, events: events as PluginEvent[] });
      }),

      deliverPluginEvents: ({ event, system }) => {
        const { plugin, events } = typeOf('DELIVER_PLUGIN_EVENTS', event);
        // A registered plugin's actor is running: the shell spawns it in the same step that registers the plugin
        const actor = system.get(plugin);
        for (const e of events) actor?.send(e);
      },

      processGlobalHotkey: ({ self, context, event }) => {
        const { hotkeyEvent, originalEvent } = typeOf('PROCESS_GLOBAL_HOTKEY', event);
        const actionType = processHotkeys(hotkeyEvent, context.hotkeys, {
          toggleInspectionPanel: 'TOGGLE_INSPECTION_PANEL',
          switchPluginUp: 'SWITCH_PLUGIN_UP',
          switchPluginDown: 'SWITCH_PLUGIN_DOWN',
        });
        if (actionType) {
          originalEvent?.preventDefault();
          self.send({ type: actionType });
        } else {
          // Not an application hotkey, forward to plugins
          self.send({ type: 'FORWARD_HOTKEY', event: hotkeyEvent });
        }
      },

      setHotkeysDisabled: assign({ hotkeysDisabled: (_, value: boolean) => value }),

      forwardNavToPlugin: ({ context, system, event }) => {
        system.get(context.activePlugin.id)?.send({ type: event.type as 'NAVIGATE_BACK' | 'NAVIGATE_FORWARD' });
      },

      switchPluginByDirection: ({ context, event, self }) => {
        const next = neighbourOf(context, event.type === 'SWITCH_PLUGIN_UP' ? 'up' : 'down');
        if (next) self.send({ type: 'SELECT_PLUGIN', plugin: next.id });
      },

      forwardHotkeyToPlugin: ({ context, event, system }) => {
        const hotkeyEvent = typeOf('FORWARD_HOTKEY', event).event;
        // Plugins not open receive only their global hotkeys
        for (const plugin of context.plugins) {
          if (plugin.id === context.activePlugin.id) continue;
          const globalActions = plugin.hotkeys?.filter(h => h.global).map(h => h.action);
          if (globalActions?.length) system.get(plugin.id).send({ ...hotkeyEvent, allowedActions: new Set(globalActions) });
        }
        // The plugin open receives all of them
        system.get(context.activePlugin.id).send(hotkeyEvent);
      },

      setTargetView: assign(({ event }) => ({ targetView: (event as { target: string }).target })),
      sendRouteClick: sendTo(
        ({ system, context }) => system.get(context.defaultToggles.canvas ? context.defaultPlugin.id : context.activePlugin.id),
        ({ event }) => event,
      ),
      setBreadcrumbs: assign(({ event }) => ({
        breadcrumbs: typeOf('TRAIL_UPDATE', event).crumbs,
        contextMenuItems: typeOf('TRAIL_UPDATE', event).menuItems,
      })),

      setActivePlugin: enqueueActions(({ context, event, enqueue, system }) => {
        const { plugin, historyIndex } = typeOf('SELECT_PLUGIN', event);
        const newPlugin = context.plugins.find(p => p.id === plugin) || context.activePlugin;
        // Opening a plugin settles which one this window shows
        if (context.pendingPluginId) enqueue.assign({ pendingPluginId: null });

        // Un-expand the chat when navigating to a plugin
        if (context.panelSizes.chatMaximized) {
          enqueue.assign(({ context }) => ({ panelSizes: saved(chatRestored(context.panelSizes)) }));
        }

        if (context.activePlugin.id !== newPlugin.id) {
          system.get(context.activePlugin.id).send({ type: 'PLUGIN_DEACTIVATED' });
          system.get(newPlugin.id).send({ type: 'PLUGIN_ACTIVATED' });
        }

        enqueue.assign(({ context }) => ({
          activePlugin: newPlugin,
          defaultToggles: { ...context.defaultToggles, canvas: false },
          // The same plugin again leaves the history as it is
          ...(context.activePlugin.id === newPlugin.id ? {} : historyAfter(context, plugin, historyIndex)),
        }));

        // The host records the plugin opened, so the next window and the next run open on it: a main window's only
        if (context.ownsLastActivePlugin && context.activePlugin.id !== newPlugin.id) {
          enqueue(() => client.send({ to: HOST.application, event: { type: 'SET_LAST_ACTIVE_PLUGIN', plugin: newPlugin.id } }));
        }
      }),
      toggleCanvas: assign(({ context }) => ({ defaultToggles: { canvas: !context.defaultToggles.canvas } })),
      trailActivePlugin: spawnChild('pluginTrailer', { id: 'pluginTrailer', input: ({ context }) => context.activePlugin.id }),
      trailNewPlugin: enqueueActions(({ enqueue, context, event }) => {
        const pluginId = event.type === 'DEFAULT_TOGGLE'
          ? (!context.defaultToggles.canvas ? context.defaultPlugin.id : context.activePlugin.id)
          : typeOf('SELECT_PLUGIN', event).plugin;
        enqueue.sendTo('pluginTrailer', { type: 'TRAIL_NEW_PLUGIN', id: pluginId });
        enqueue.assign(({ system }) => {
          const pluginActor = system.get(pluginId);
          return pluginActor ? { targetView: computeCrumbs(pluginActor.getSnapshot()).target ?? '' } : {};
        });
      }),
      spawnPluginActors: enqueueActions(({ enqueue, context }) => {
        for (const plugin of context.plugins) spawnPluginActor(enqueue, plugin);
      }),

      resizePanel: assign(({ context, event }) => {
        const { panel, size } = typeOf('RESIZE_PANEL', event);
        return { panelSizes: saved(resized(context.panelSizes, panel, size)) };
      }),
      maximizeChat: assign(({ context }) => ({ panelSizes: saved(chatMaximized(context.panelSizes)) })),
      restoreChat: assign(({ context }) => ({ panelSizes: saved(chatRestored(context.panelSizes)) })),
      toggleInspectionPanel: assign(({ context }) => ({ panelSizes: saved(inspectionToggled(context.panelSizes)) })),

      closeDevLetter: ({ self }) => {
        self.send({ type: 'SELECT_PLUGIN', plugin: getDesignated('threads') });
      },
    },
    guards: {
      areHotkeysEnabled: ({ context }) => !context.hotkeysDisabled,
      isMainWindow: ({ context }) => context.ownsLastActivePlugin,
    },
  }).createMachine({
    // `#application.*` targets name this id; the actor runs as HOST.application
    id: 'application',
    context: ({ input }) => {
      const plugins = withHostLast(packs.getRegisteredPlugins());
      // A popout opens on its plugin (once its pack's frontend adds it, if an external pack's); a main window on the
      // first, until the host says which was last open
      const initialPlugin = plugins.find((p) => p.id === input.initialPluginId);
      const initialActivePlugin = initialPlugin ?? plugins[0];
      return {
        plugins,
        pluginVisibility: Object.fromEntries(plugins.map((plugin) => [plugin.id, true])),
        activePlugin: initialActivePlugin,
        defaultPlugin: packs.getRegisteredDefaultPlugin(),
        pluginHistory: [initialActivePlugin.id],
        historyIndex: 0,
        breadcrumbs: [],
        contextMenuItems: [],
        defaultToggles: { canvas: false },
        targetView: '',
        panelSizes: initialPanelSizes(storage),
        hotkeysDisabled: false,
        // Empty until the backend sends them
        hotkeys: {},
        ownsLastActivePlugin: input.ownsLastActivePlugin ?? true,
        pendingPluginId: initialPlugin ? null : input.initialPluginId ?? null,
        awaitingPlugin: [],
        busSubscribed: false,
        packLoadRunning: false,
        packLoadQueued: false,
        packFrontendsLoaded: [],
        packsWithFrontend: [],
        packsUnloadedWhileLoading: [],
        loadedPacksRead: false,
      };
    },
    initial: 'running',
    entry: [
      'spawnPluginActors',
      ({ context, system }) => {
        system.get(context.activePlugin.id).send({ type: 'PLUGIN_ACTIVATED' });
      },
      'trailActivePlugin',
      spawnChild('hotkeyListener', { id: 'hotkeyListener' }),
      spawnChild('mouseListener', { id: 'mouseListener' }),
      spawnChild('connectionListener', { id: 'connectionListener' }),
    ],
    states: {
      'onboarding': {
        tags: ['onboarding'],
        // Maximized for the moment, so not saved
        entry: assign({ panelSizes: ({ context }) => ({ ...context.panelSizes, chatMaximized: true }) }),
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
                  client.describeConnection().then((details) => notify.errorPage('Unable to connect', details));
                },
              },
            },
            on: {
              CLIENT_CONNECTED: [
                {
                  target: '#application.onboarding.letter',
                  guard: ({ event }) => typeOf('CLIENT_CONNECTED', event).hasOnboarded === false,
                  actions: 'applyShellState',
                },
                { target: 'connected', actions: 'applyShellState' },
              ],
            },
          },
          'connected': {
            on: {
              // The backend reconnected (after a crash and restart, say)
              CLIENT_CONNECTED: {
                target: 'connected',
                reenter: true,
                actions: 'applyShellState',
              },
            },
          },
        },
      },
      'error': {},
    },
    on: {
      APPLICATION_HOTKEYS: { actions: 'updateHotkeys' },
      // In every state: onboarding and the error page keep pack systems' startup data flowing too. The loader runs on
      // every establishment of the subscription, so packs a failed read left unloaded are picked up by the next one.
      BUS_SUBSCRIBED: { actions: [assign({ busSubscribed: true }), 'announceLoadedPacks', 'loadPackFrontends'] },
      BUS_CONNECTION_LOST: { actions: assign({ busSubscribed: false }) },
      LOAD_PACK_FRONTENDS: { actions: 'loadPackFrontends' },
      PACK_FRONTENDS_SETTLED: { actions: 'onPackFrontendsSettled' },
      PACK_FRONTEND_LOADED: { actions: 'mergePackPlugins' },
      PACK_PLUGINS_UNLOADED: { actions: 'removePackPlugins' },
      PLUGIN_VISIBILITY_UPDATED: { actions: 'updatePluginVisibility' },
      SET_PLUGIN_VISIBILITY: { actions: 'setPluginVisibility' },
      OPEN_PLUGIN: { actions: 'doOpenPlugin' },
      SEND_TO_PLUGIN: { actions: 'sendToPlugin' },
      // A backend's request: a main window opens the plugin, a popout keeps the one it shows
      OPEN_PLUGIN_FROM_APP: { guard: 'isMainWindow', actions: 'openPluginFromApp' },
      DELIVER_PLUGIN_EVENTS: { actions: 'deliverPluginEvents' },
      TRAIL_UPDATE: { actions: ['setBreadcrumbs', 'setTargetView'] },
      TRAIL_CLICK: { actions: ['setTargetView', 'sendRouteClick'] },
      DEFAULT_TOGGLE: { actions: ['trailNewPlugin', 'toggleCanvas'] },
      SELECT_PLUGIN: { actions: ['setActivePlugin', 'trailNewPlugin'] },
      RESIZE_PANEL: { actions: 'resizePanel' },
      TOGGLE_INSPECTION_PANEL: { actions: 'toggleInspectionPanel' },
      MAXIMIZE_CHAT: { actions: 'maximizeChat' },
      RESTORE_CHAT: { actions: 'restoreChat' },
      SWITCH_PLUGIN_UP: { actions: 'switchPluginByDirection' },
      SWITCH_PLUGIN_DOWN: { actions: 'switchPluginByDirection' },
      NAVIGATE_BACK: { actions: 'forwardNavToPlugin' },
      NAVIGATE_FORWARD: { actions: 'forwardNavToPlugin' },
      FORWARD_HOTKEY: { actions: 'forwardHotkeyToPlugin' },
      PROCESS_GLOBAL_HOTKEY: { guard: 'areHotkeysEnabled', actions: 'processGlobalHotkey' },
      HOTKEYS_RECORDING_START: { actions: { type: 'setHotkeysDisabled', params: true } },
      HOTKEYS_RECORDING_END: { actions: { type: 'setHotkeysDisabled', params: false } },
      BACKEND_ERROR: {
        target: '.error',
        actions: ({ event }) => notify.errorPage('Something went wrong', typeOf('BACKEND_ERROR', event).error),
      },
      SYSTEM_ERROR: {
        actions: ({ event }) => {
          const ev = typeOf('SYSTEM_ERROR', event);
          // A diagnostic is for whoever is building the app or a pack, and it is already in the Logs plugin.
          // Interrupting the person using the app with it tells them nothing they can act on.
          if (ev.severity === 'diagnostic') return;
          if (ev.severity === 'fatal') {
            notify.errorPage(ev.title ?? 'Something went wrong', { message: ev.message, stack: ev.stack });
            return;
          }
          notify.error(ev.title ?? 'Something went wrong', ev.message);
        },
      },
      NOOP: {},
    },
  });
}

/** The shell's machine */
export type ShellMachine = ReturnType<typeof createShellMachine>;
