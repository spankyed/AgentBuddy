import { ENTITY_OPENING_ID, createEntityOpeningMachine, checkEntityOpening, type EntityOpeningActor } from './entity-opening.ts';
// The app shell: the host `application` feature's plugin, which runs every plugin's actor, holds which one is open,
// lays out the panels and loads every pack's frontend. Its I/O arrives as options (types.ts); the renderer
// composes it with the API client and the window, a pack's tests with fakes.
import { assign, enqueueActions, fromCallback, setup, spawnChild } from 'xstate';
import { processHotkeys, safeEvents } from '@apackdev/sdk/fe';
import { splitRef } from '@apackdev/sdk/ids';
import { senderSuffix } from '@apackdev/sdk/events';
import { isPlainObject } from '@apackdev/sdk/utils/pure';
import type { HostShellEvent, HostShellState, PluginEvent, ShellPanelSizes, Plugin } from '@apackdev/sdk/fe';
import { selectDefaultPluginDeclaration, getEligiblePlugin, selectPluginDeclaration } from '../../../fe/plugin-selection.ts';
import { HOST } from '../../../refs.ts';
import { connectionListener } from './connection.ts';
import { hotkeyListener, mouseListener } from './input.ts';
import {
  chatMaximized, chatRestored, initialPanelSizes, inspectionToggled, resized,
} from './layout.ts';
import { announcePackClientReady, PACK_FRONTEND_LOADER_ID, packFrontendLoader } from './pack-frontends.ts';
import { historyAfter, neighbourOf, spawnPluginActor, withHostLast } from './plugins.ts';
import { pluginNavigationItems } from '../../../fe/plugin-navigation.ts';
import { notifyPluginActor, sendToPluginActor } from '../../../fe/plugin-delivery.ts';
import { computeCrumbs, pluginTrailer } from './trail.ts';
import type { PluginRequest, ShellContext, ShellEvent, ShellOptions, ShellParams } from './types.ts';

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

/** Whether a pack frontend may still add plugins: the loaded packs not read yet, or a load running or queued */
function packFrontendsPending(context: ShellContext): boolean {
  return !context.loadedPacksRead || context.packLoadRunning || context.packLoadQueued;
}

/**
 * What the user is told when a plugin isn't here: the title and the detail, for `notify.error`.
 *
 * Opening and sending can each be refused at once or after waiting for pack frontends, and one function writes
 * every one of those so the wording can't differ by which branch the app happened to take — which would tell the
 * reader about the app's internals and nothing about their problem.
 *
 * Not every refusal has a user to tell, so `refuse` picks the audience and this writes only that audience's
 * words. An answer gets the other wording, for the reason given there.
 */
function refusal({ plugin, select, sender }: PluginRequest, detail?: string): [string, string] {
  const suffix = senderSuffix(sender);
  return [`Couldn't ${select ? 'open' : 'reach'} ${plugin}`, `${detail ?? `No plugin is declared at "${plugin}".`}${suffix && ` Sent${suffix}.`}`];
}

/** The part of `enqueueActions`' `enqueue` that `readyFor` needs, so it can be a function rather than a third action */
type Enqueue = {
  (action: () => void): void;
  assign: (values: Partial<ShellContext>) => void;
  sendTo: (owner: EntityOpeningActor, event: { type: 'REFUSED'; token: string; detail: string }) => void;
};

/** The app shell over `options`, the I/O it's given */
export function createShellMachine({ packs, catalog, client, packFrontends, storage, notify, target }: ShellOptions) {
  const entityOptions = { client, catalog, bindings: () => packs.pluginBindings(), refuse: (title: string, detail: string) => notify.error(title, detail) };
  const selectedDefaultPlugin = (plugins: readonly Plugin[]) => {
    const declaration = selectDefaultPluginDeclaration(catalog);
    const accepted = declaration ? getEligiblePlugin(catalog, packs.pluginBindings(), declaration.featureRef) : undefined;
    return accepted && plugins.includes(accepted) ? accepted : undefined;
  };
  const currentPlugin = (context: ShellContext, ref: string) => {
    const accepted = getEligiblePlugin(catalog, packs.pluginBindings(), ref);
    return accepted && context.plugins.includes(accepted) ? accepted : undefined;
  };
  const unavailable = (ref: string): string | undefined => {
    const declaration = selectPluginDeclaration(catalog, ref);
    if (declaration?.origin === 'native') return declaration.enabled === true ? undefined : `The pack providing "${ref}" is disabled.`;
    if (catalog.status() !== 'ready') return catalog.status() === 'loading' ? undefined : 'Plugin declarations are unavailable.';
    if (!declaration) return `No plugin is declared at "${ref}".`;
    if (declaration.origin === 'source') return `The pack providing "${ref}" is not installed.`;
    if (declaration.enabled !== true) return `The pack providing "${ref}" is disabled.`;
  };

  /** Sizes the user chose, which the next window opens with; sizes set for the moment are assigned without it */
  const saved = (sizes: ShellPanelSizes): ShellPanelSizes => {
    storage.savePanelSizes(sizes);
    return sizes;
  };

  /**
   * Tells whoever this concerns that the plugin isn't here, and **who that is depends on whether a person is
   * waiting.** A command someone gave in this window failed, so they are told; an answer to a question had no
   * user behind it, so a toast would be an app telling someone about its own plumbing in the middle of their
   * work — unactionable by construction, since the thing that asked was a machine.
   *
   * It is still a loss worth recording, so it goes to the console as the bus's undeliverable sends do
   * (`connection.ts`), with a sentence written for a log rather than for a person.
   *
   * The case it fires in is a race, not a bug: a plugin asks, its answer is built, and the answering pack
   * unloads before the answer lands. Nothing holds the asker open.
   */
  const refuse = (context: ShellContext, request: PluginRequest, enqueue: Enqueue, detail?: string): void => {
    if (request.entityToken) {
      enqueue.sendTo(context.entityOpening, { type: 'REFUSED', token: request.entityToken, detail: detail ?? unavailable(request.plugin) ?? `The plugin "${request.plugin}" could not be loaded.` });
      return;
    }
    enqueue(() => {
      if (!request.answering) {
        notify.error(...refusal(request, detail ?? unavailable(request.plugin)
          ?? (selectPluginDeclaration(catalog, request.plugin) ? `The plugin "${request.plugin}" could not be loaded.` : undefined)));
        return;
      }
      const suffix = senderSuffix(request.sender);
      console.warn(`[shell] Dropped an answer for "${request.plugin}": no plugin is registered there${suffix && `, answering${suffix}`}`);
    });
  };

  /**
   * Whether the plugin is here to take the request, and what to do when it isn't: wait, while pack frontends may
   * still add it (finishPackFrontendLoad refuses whatever is still waiting), or refuse it now. Both requests ask
   * the same question and answer it the same way, so `false` means the caller has nothing left to do but return.
   */
  const readyFor = (context: ShellContext, request: PluginRequest & { events: PluginEvent[] }, enqueue: Enqueue): boolean => {
    if (request.entityToken) {
      const opening = checkEntityOpening(context.entityOpening, request.entityToken, entityOptions);
      if (!opening.current) return false;
      if (opening.problem) { refuse(context, request, enqueue, opening.problem); return false; }
    }
    const reason = unavailable(request.plugin);
    if (reason) {
      refuse(context, request, enqueue, reason); return false;
    }
    if (currentPlugin(context, request.plugin)) return true;
    if (catalog.status() === 'loading' || packFrontendsPending(context)) enqueue.assign({ awaitingPlugin: [...context.awaitingPlugin, request] });
    else {
      refuse(context, request, enqueue);
    }
    return false;
  };

  return setup({
    types: {
      context: {} as ShellContext,
      events: {} as ShellEvent,
      input: {} as ShellParams,
    },
    actors: {
      entityOpening: createEntityOpeningMachine(entityOptions),
      pluginCatalogListener: fromCallback(({ sendBack }) => catalog.subscribe(() => sendBack({ type: 'PLUGIN_DECLARATIONS_CHANGED' }))),
      hotkeyListener: hotkeyListener(target),
      mouseListener: mouseListener(target),
      connectionListener: connectionListener(client),
      packFrontendLoader: packFrontendLoader(client, packFrontends),
      pluginTrailer,
    },
    // An action is named for what it does to the shell, never for the event or the API call that triggered it: a
    // trigger name collides with whatever does the triggering, and it can't survive a second caller — several of
    // these serve more than one transition, so there is no single event to name them after.
    actions: {
      beginEntityOpen: enqueueActions(({ context, event, enqueue }) => {
        enqueue.assign({ wantsDefaultPlugin: false, pendingPluginId: null });
        enqueue.sendTo(context.entityOpening, typeOf('OPEN_ENTITY', event));
      }),
      cancelEntityOpen: enqueueActions(({ context, enqueue }) => { enqueue.sendTo(context.entityOpening, { type: 'CANCEL' }); }),
      updateEntityDestination: enqueueActions(({ context, enqueue }) => { enqueue.sendTo(context.entityOpening, { type: 'CHANGED' }); }),
      refreshPluginDeclarations: enqueueActions(({ context, enqueue }) => {
        const claimed = selectedDefaultPlugin(context.plugins) ?? null;
        enqueue.assign({ defaultPlugin: claimed });
        if (context.wantsDefaultPlugin && !context.pendingPluginId && claimed) enqueue.raise({ type: 'SELECT_PLUGIN', plugin: claimed.id });
        // A frontend may be admitted before its declaration frame reaches this window. Reconcile
        // from accepted bindings when that frame arrives, without keeping a second pending inventory.
        const bindings = packs.pluginBindings();
        const changedOwners = new Set([...bindings].filter(([ref, accepted]) => accepted.runtimeRevision
          && getEligiblePlugin(catalog, bindings, ref) && !context.plugins.includes(accepted.binding)).map(([, accepted]) => accepted.packId));
        const pending = new Set<string>();
        for (const packId of changedOwners) {
          const accepted = [...bindings.values()].filter(binding => binding.packId === packId);
          if (!accepted.every(binding => getEligiblePlugin(catalog, bindings, binding.binding.id))) continue;
          pending.add(packId);
          enqueue.raise({ type: 'PACK_FRONTEND_LOADED', packId, runtimeRevision: accepted[0]!.runtimeRevision!, plugins: accepted.map(binding => binding.binding) });
        }
        const waiting = [];
        for (const request of context.awaitingPlugin) {
          if (currentPlugin(context, request.plugin)) {
            enqueue.raise(request.select ? { type: 'OPEN_PLUGIN', plugin: request.plugin, events: request.events, entityToken: request.entityToken }
              : { type: 'SEND_TO_PLUGIN', plugin: request.plugin, events: request.events, ...request.sender, answering: request.answering, call: request.call });
          } else if (unavailable(request.plugin) || (catalog.status() === 'ready' && !packFrontendsPending(context) && !pending.has(splitRef(request.plugin)?.packId ?? ''))) {
            refuse(context, request, enqueue);
          } else waiting.push(request);
        }
        enqueue.assign({ awaitingPlugin: waiting });
        if (context.pendingPluginId) {
          if (unavailable(context.pendingPluginId)) enqueue.assign({ pendingPluginId: null });
          else if (currentPlugin(context, context.pendingPluginId)) enqueue.raise({ type: 'SELECT_PLUGIN', plugin: context.pendingPluginId });
        }
      }),

      updateHotkeys: assign(({ event }) => ({ hotkeys: typeOf('APPLICATION_HOTKEYS', event).hotkeys })),

      mergePackPlugins: enqueueActions(({ event, context, system, enqueue }) => {
        const { packId, runtimeRevision, plugins: packPlugins } = typeOf('PACK_FRONTEND_LOADED', event);

        // The pack was unloaded while its frontend was loading: keep its plugins out, since nothing would ever take
        // them out again, and undo what the load registered
        if (context.packsUnloadedWhileLoading.includes(packId)) {
          enqueue.assign({ packsUnloadedWhileLoading: context.packsUnloadedWhileLoading.filter(id => id !== packId) });
          enqueue(() => packFrontends.unload(packId));
          return;
        }

        if (packPlugins?.some(plugin => {
          const accepted = packs.pluginBindings().get(plugin.id);
          return getEligiblePlugin(catalog, packs.pluginBindings(), plugin.id) !== plugin
            || (accepted?.runtimeRevision !== undefined && accepted.runtimeRevision !== runtimeRevision);
        })) return;

        const acceptedPackRuntimes = { ...context.acceptedPackRuntimes, [packId]: runtimeRevision };

        // Only an accepted load reaches this action. Replace this owner's actors and view together;
        // failed candidates never retire the incumbent or disturb its selection.
        const previous = context.plugins.filter(plugin => plugin.id.startsWith(`${packId}/`));
        const retained = context.plugins.filter(plugin => !plugin.id.startsWith(`${packId}/`));
        const newPlugins = packPlugins ?? [];
        const firstPrevious = context.plugins.findIndex(plugin => plugin.id.startsWith(`${packId}/`));
        const position = firstPrevious < 0 ? retained.length : firstPrevious;
        const plugins = withHostLast([...retained.slice(0, position), ...newPlugins, ...retained.slice(position)]);
        const defaultPlugin = selectedDefaultPlugin(plugins) ?? null;
        const replacingActive = previous.some(plugin => plugin.id === context.activePlugin.id);
        const activePlugin = replacingActive
          ? (newPlugins.find(plugin => plugin.id === context.activePlugin.id) ?? plugins[0])
          : context.activePlugin;
        for (const plugin of previous) {
          const actor = system.get(plugin.id);
          if (actor) enqueue.stopChild(actor);
        }
        const packsWithFrontend = packPlugins === null
          ? context.packsWithFrontend.filter(id => id !== packId)
          : context.packsWithFrontend.includes(packId) ? context.packsWithFrontend : [...context.packsWithFrontend, packId];
        enqueue.assign({ plugins, acceptedPackRuntimes, packsWithFrontend, defaultPlugin,
          ...(activePlugin ? { activePlugin } : {}) });
        if (newPlugins.length > 0) {
          // Visibility is the host's (AppState, sent on each connection); unset shows the plugin
          for (const plugin of newPlugins) spawnPluginActor(enqueue, plugin);
          const added = new Set<string>(newPlugins.map((p) => p.id));
          // A pack claiming the app's default is how this window learns what it is. It opens it only while
          // nothing else has decided what is shown, so a window the user has navigated, or one the host told
          // which plugin was last open, is left alone
          const claimed = selectedDefaultPlugin(plugins);
          if (claimed && added.has(claimed.id)) {
            enqueue.assign({ defaultPlugin: claimed, wantsDefaultPlugin: false });
            if (context.wantsDefaultPlugin && !context.pendingPluginId) {
              enqueue.raise({ type: 'SELECT_PLUGIN', plugin: claimed.id });
            }
          }
          const pending = context.pendingPluginId;
          if (pending && added.has(pending)) enqueue.raise({ type: 'SELECT_PLUGIN', plugin: pending });
          // Plugins asked to open while their pack loaded open now, with their events
          const arrived = context.awaitingPlugin.filter((work) => added.has(work.plugin));
          if (arrived.length > 0) {
            enqueue.assign({ awaitingPlugin: context.awaitingPlugin.filter((work) => !added.has(work.plugin)) });
            // `select` is what the wait was for: an open selects the plugin, a send only hands it its events
            for (const { plugin, events, select, sender, answering, call, entityToken } of arrived) {
              // One spread, because who asked is one member: the labels a refusal would name and the address an
              // answer goes to left the queue together, as they entered it.
              //
              // `answering` rides along to keep the re-raised event identical to the one that was queued, and
              // **no case covers it, because nothing reads it on this path**: the drain re-raises only the
              // requests whose plugin arrived, so `readyFor` says yes and the send is delivered rather than
              // refused. Measured by mutation 2026-10-06 — dropping it here fails nothing. What would make it
              // matter is the plugin going away again between arriving and this re-raise being handled, which
              // `PACK_PLUGINS_UNLOADED` can do; then it is refused after all, and the flag decides how.
              enqueue.raise(select ? { type: 'OPEN_PLUGIN', plugin, events, entityToken } : { type: 'SEND_TO_PLUGIN', plugin, events, ...sender, answering, call });
            }
          }
        }
        if (replacingActive && activePlugin) {
          enqueue(({ system }) => {
            const actor = system.get(activePlugin.id);
            if (actor) notifyPluginActor(actor, activePlugin.id, { type: 'PLUGIN_ACTIVATED' });
          });
        }
        if (packPlugins !== null && context.busSubscribed) enqueue(() => announcePackClientReady(client, packId, runtimeRevision));
      }),

      // This window's subscription (re)connected: its CLIENT_CONNECTED skipped the packs whose frontends load after
      // it, whatever the frontend turned out to add — a pack that exported no plugin has systems waiting too
      announceLoadedPacks: ({ context }) => {
        if (!context.packFrontendsNeedRefresh) {
          for (const packId of context.packsWithFrontend) announcePackClientReady(client, packId, context.acceptedPackRuntimes[packId]!);
        }
      },

      /** Runs the pack frontend loader, or queues a run when one is under way */
      loadPackFrontends: enqueueActions(({ context, enqueue }) => {
        if (!context.busSubscribed) return;
        if (context.packLoadRunning) {
          enqueue.assign({ packLoadQueued: true });
          return;
        }
        enqueue.assign({ packLoadRunning: true, packLoadQueued: false });
        enqueue.spawnChild('packFrontendLoader', { id: PACK_FRONTEND_LOADER_ID, input: { acceptedPackRuntimes: context.acceptedPackRuntimes, refresh: context.packFrontendsNeedRefresh } });
      }),

      /** The loader finished: run it again when a load was asked for meanwhile, and report what failed */
      finishPackFrontendLoad: enqueueActions(({ context, event, enqueue }) => {
        const { loadedPacksError, failedPacks } = typeOf('PACK_FRONTENDS_SETTLED', event);
        enqueue.stopChild(PACK_FRONTEND_LOADER_ID);
        const refresh = context.packFrontendsNeedRefresh && (!!loadedPacksError || !!failedPacks?.length);
        enqueue.assign({ packFrontendsNeedRefresh: refresh });

        // Every result of the run that finished has arrived, so nothing is left to drop
        if (context.packsUnloadedWhileLoading.length > 0) enqueue.assign({ packsUnloadedWhileLoading: [] });

        if (context.packLoadQueued) {
          enqueue.assign({ packLoadQueued: false });
          // The packs this run loaded are in context already: the loader sends its results before settling
          enqueue.spawnChild('packFrontendLoader', { id: PACK_FRONTEND_LOADER_ID, input: { acceptedPackRuntimes: context.acceptedPackRuntimes, refresh } });
        } else {
          enqueue.assign({ packLoadRunning: false });
          // Loading has settled: a plugin still asked for is one no loaded pack provides
          if (context.awaitingPlugin.length > 0 && catalog.status() !== 'loading') {
            // `assign` replaces the array rather than mutating it, so the reference stays valid in the deferred enqueue
            const refused = context.awaitingPlugin;
            enqueue.assign({ awaitingPlugin: [] });
            for (const request of refused) refuse(context, request, enqueue);
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
          // A refused candidate may still have a working incumbent; report the refusal without removing it.
          const names = failedPacks.map(p => p.packId).join(', ');
          const details = failedPacks.map(p => `${p.packId}: ${p.error}`).join('\n');
          enqueue(() => {
            console.warn(`[shell] Failed to load the frontend of ${names}:\n${details}`);
            notify.error(`Couldn't load ${names}`, failedPacks.map(p => p.error).join('\n'));
          });
        }
      }),

      disconnectPackFrontends: enqueueActions(({ context, enqueue }) => {
        enqueue.sendTo(context.entityOpening, { type: 'CANCEL' });
        // Stop the attempt, not the accepted frontend. The next authoritative read determines removals.
        enqueue.stopChild(PACK_FRONTEND_LOADER_ID);
        enqueue.assign({ busSubscribed: false, packLoadRunning: false, packLoadQueued: false,
          packFrontendsNeedRefresh: true, packsUnloadedWhileLoading: [] });
      }),

      removePackPlugins: enqueueActions(({ event, context, system, enqueue }) => {
        const { packId } = typeOf('PACK_PLUGINS_UNLOADED', event);
        enqueue.sendTo(context.entityOpening, { type: 'UNLOADED', packId });
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
        enqueue.assign({ acceptedPackRuntimes: Object.fromEntries(Object.entries(context.acceptedPackRuntimes).filter(([id]) => id !== packId)) });
        if (context.packLoadRunning && !context.packsUnloadedWhileLoading.includes(packId)) {
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
        const defaultPlugin = selectedDefaultPlugin(remaining) ?? null;
        const activePlugin = needsNavigate ? (remaining[0] ?? context.activePlugin) : context.activePlugin;

        // Plugin children are spawned by system id only, so stop them by reference
        for (const id of pluginIds) {
          const plugin = system.get(id);
          if (plugin) enqueue.stopChild(plugin);
        }

        enqueue.assign({ plugins: remaining, pluginVisibility, activePlugin, defaultPlugin });

        if (needsNavigate) {
          enqueue(({ system }) => {
            // Tolerated: this runs as a pack's plugins arrive, where the actor may not be spawned yet
            const active = system.get(activePlugin.id);
            if (active) notifyPluginActor(active, activePlugin.id, { type: 'PLUGIN_ACTIVATED' });
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
        // The host naming a plugin is a decision about what this window shows, so the default no longer is
        if (context.ownsLastActivePlugin && lastActivePlugin) enqueue.assign({ wantsDefaultPlugin: false });
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
       * Selects the plugin, opens the canvas, then hands it its events — what `OPEN_PLUGIN` asks for. The selecting
       * half of the pair, and the reason the pair exists: a send that stole the user's canvas would make every
       * cross-feature command a navigation.
       */
      selectAndDeliver: enqueueActions(({ context, event, enqueue }) => {
        const { plugin, events, entityToken } = typeOf('OPEN_PLUGIN', event);
        if (!entityToken) enqueue.sendTo(context.entityOpening, { type: 'CANCEL' });
        if (!readyFor(context, { plugin, events, entityToken, select: true, sender: {} }, enqueue)) return;
        if (entityToken) enqueue.sendTo(context.entityOpening, { type: 'READY', token: entityToken });
        if (context.activePlugin.id !== plugin) enqueue.raise({ type: 'SELECT_OPENED_PLUGIN', plugin });
        if (context.defaultToggles.canvas) enqueue.raise({ type: 'DEFAULT_TOGGLE', area: 'canvas' });
        if (events.length > 0 || entityToken) enqueue(({ self }) => self.send({ type: 'DELIVER_PLUGIN_EVENTS', plugin, events, entityToken }));
      }),

      /** Hands a plugin its events and leaves the view where it is — what `SEND_TO_PLUGIN` asks for */
      deliverWithoutSelecting: enqueueActions(({ context, event, enqueue }) => {
        const { plugin, events, from, via, asker, answering, call } = typeOf('SEND_TO_PLUGIN', event);
        if (!readyFor(context, { plugin, events, select: false, sender: { from, via, asker }, answering, call }, enqueue)) return;
        if (events.length > 0) enqueue(({ self }) => self.send({ type: 'DELIVER_PLUGIN_EVENTS', plugin, events, asker, answering, call }));
      }),

      // A backend's request carries whatever the sending pack built: a payload that isn't a plugin and its events
      // would crash the plugin's actor, or this one, so it is refused here rather than delivered
      checkBackendOpenRequest: enqueueActions(({ event, enqueue }) => {
        const { plugin, events = [] } = typeOf('OPEN_PLUGIN_FROM_APP', event);
        const deliverable = Array.isArray(events) && events.every((e) => isPlainObject(e) && typeof e.type === 'string');
        if (typeof plugin !== 'string' || !deliverable) {
          enqueue(() => notify.error("Couldn't open a plugin", `A pack asked the app to open "${String(plugin)}" with events it can't deliver`));
          return;
        }
        enqueue.raise({ type: 'OPEN_PLUGIN' as const, plugin, events: events as PluginEvent[] });
      }),

      deliverPluginEvents: enqueueActions(({ event, context, system, enqueue }) => {
        const { plugin, events, asker, answering, call, entityToken } = typeOf('DELIVER_PLUGIN_EVENTS', event);
        if (entityToken) {
          enqueue.sendTo(context.entityOpening, { type: 'DELIVER', token: entityToken });
          return;
        }
        const actor = system.get(plugin);
        if (!currentPlugin(context, plugin) || !actor) {
          refuse(context, { plugin, select: false, sender: { asker }, answering, call }, enqueue, `The plugin "${plugin}" is no longer ready.`);
          return;
        }
        // The address arrived built, so nothing here decides which channel an answer takes — only whether there
        // is one. A send that named no sender is news, and its handler is handed no `reply`.
        //
        // The call rides with it for the receiver's guards, which is the in-window half of what `connection.ts`
        // does for a backend send: one reader, `callOf(event)`, whichever channel the event came in on.
        const correlation = { ...(call === undefined ? {} : { call }), ...(answering === undefined ? {} : { answering }) };
        for (const e of events) {
          if (asker) sendToPluginActor(actor, plugin, e, asker, correlation);
          else notifyPluginActor(actor, plugin, e, correlation);
        }
      }),

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
        // Tolerated: a mouse button can arrive while the open plugin's pack is unloading
        const navigating = system.get(context.activePlugin.id);
        if (navigating) notifyPluginActor(navigating, context.activePlugin.id, { type: event.type as 'NAVIGATE_BACK' | 'NAVIGATE_FORWARD' });
      },

      switchPluginByDirection: ({ context, event, self }) => {
        const next = neighbourOf(pluginNavigationItems(catalog, packs.pluginBindings(), context.pluginVisibility)
          .filter(plugin => plugin.visible), context.activePlugin.id, event.type === 'SWITCH_PLUGIN_UP' ? 'up' : 'down');
        if (next) self.send({ type: 'SELECT_PLUGIN', plugin: next.id });
      },

      forwardHotkeyToPlugin: ({ context, event, system }) => {
        const hotkeyEvent = typeOf('FORWARD_HOTKEY', event).event;
        // Plugins not open receive only their global hotkeys
        for (const plugin of context.plugins) {
          if (plugin.id === context.activePlugin.id) continue;
          const globalActions = plugin.hotkeys?.filter(h => h.global).map(h => h.action);
          if (globalActions?.length) notifyPluginActor(system.get(plugin.id), plugin.id, { ...hotkeyEvent, allowedActions: new Set(globalActions) });
        }
        // The plugin open receives all of them
        notifyPluginActor(system.get(context.activePlugin.id), context.activePlugin.id, hotkeyEvent);
      },

      setTargetView: assign(({ event }) => ({ targetView: (event as { target: string }).target })),
      // Through the funnel rather than XState's `sendTo`, which names nobody: a plugin handling a route click
      // could make no answerable send of its own. Nobody asked for the click, so it carries no asker.
      sendRouteClick: ({ system, context, event }) => {
        const ref = context.defaultToggles.canvas ? (context.defaultPlugin?.id ?? context.activePlugin.id) : context.activePlugin.id;
        notifyPluginActor(system.get(ref), ref, event);
      },
      setBreadcrumbs: assign(({ event }) => ({
        breadcrumbs: typeOf('TRAIL_UPDATE', event).crumbs,
        contextMenuItems: typeOf('TRAIL_UPDATE', event).menuItems,
      })),

      setActivePlugin: enqueueActions(({ context, event, enqueue, system }) => {
        const selection = typeOf(['SELECT_PLUGIN', 'SELECT_OPENED_PLUGIN'], event);
        const { plugin } = selection;
        const historyIndex = 'historyIndex' in selection ? selection.historyIndex : undefined;
        const newPlugin = currentPlugin(context, plugin);
        if (!newPlugin) return;
        // Opening a plugin settles which one this window shows
        if (context.pendingPluginId) enqueue.assign({ pendingPluginId: null });
        if (context.wantsDefaultPlugin) enqueue.assign({ wantsDefaultPlugin: false });

        // Un-expand the chat when navigating to a plugin
        if (context.panelSizes.chatMaximized) {
          enqueue.assign(({ context }) => ({ panelSizes: saved(chatRestored(context.panelSizes)) }));
        }

        if (context.activePlugin.id !== newPlugin.id) {
          notifyPluginActor(system.get(context.activePlugin.id), context.activePlugin.id, { type: 'PLUGIN_DEACTIVATED' });
          notifyPluginActor(system.get(newPlugin.id), newPlugin.id, { type: 'PLUGIN_ACTIVATED' });
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
          ? (!context.defaultToggles.canvas ? (context.defaultPlugin?.id ?? context.activePlugin.id) : context.activePlugin.id)
          : typeOf(['SELECT_PLUGIN', 'SELECT_OPENED_PLUGIN'], event).plugin;
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
        const threads = packs.designation('threads');
        if (threads) {
          self.send({ type: 'SELECT_PLUGIN', plugin: threads });
        }
      },
    },
    guards: {
      areHotkeysEnabled: ({ context }) => !context.hotkeysDisabled,
      isMainWindow: ({ context }) => context.ownsLastActivePlugin,
    },
  }).createMachine({
    // `#application.*` targets name this id; the actor runs as HOST.application
    id: 'application',
    context: ({ input, spawn, self }) => {
      const plugins = withHostLast(packs.getRegisteredPlugins());
      // A popout opens on its plugin (once its pack's frontend adds it); a main window on the
      // first, until the host says which was last open
      const initialPlugin = plugins.find((p) => p.id === input.initialPluginId);
      const claimedDefault = selectedDefaultPlugin(plugins) ?? null;
      const initialActivePlugin = initialPlugin ?? claimedDefault ?? plugins[0];
      return {
        plugins,
        pluginVisibility: {},
        activePlugin: initialActivePlugin,
        defaultPlugin: claimedDefault,
        // Nothing specific was asked for and no pack has claimed a default yet, so open it when one does
        wantsDefaultPlugin: claimedDefault === null && input.initialPluginId === undefined,
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
        entityOpening: spawn('entityOpening', { id: ENTITY_OPENING_ID, input: { isConnected: () => self.getSnapshot().context.busSubscribed } }),
        busSubscribed: false,
        packLoadRunning: false,
        packLoadQueued: false,
        packFrontendsNeedRefresh: false,
        acceptedPackRuntimes: {},
        packsWithFrontend: [],
        packsUnloadedWhileLoading: [],
        loadedPacksRead: false,
      };
    },
    initial: 'running',
    entry: [
      'spawnPluginActors',
      ({ context, system }) => {
        notifyPluginActor(system.get(context.activePlugin.id), context.activePlugin.id, { type: 'PLUGIN_ACTIVATED' });
      },
      'trailActivePlugin',
      spawnChild('hotkeyListener', { id: 'hotkeyListener' }),
      spawnChild('mouseListener', { id: 'mouseListener' }),
      spawnChild('connectionListener', { id: 'connectionListener' }),
      spawnChild('pluginCatalogListener', { id: 'pluginCatalogListener' }),
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
      PLUGIN_DECLARATIONS_CHANGED: { actions: ['refreshPluginDeclarations', 'updateEntityDestination'] },
      APPLICATION_HOTKEYS: { actions: 'updateHotkeys' },
      // In every state: onboarding and the error page keep pack systems' startup data flowing too. The loader runs on
      // every establishment of the subscription, so packs a failed read left unloaded are picked up by the next one.
      BUS_SUBSCRIBED: { actions: [assign({ busSubscribed: true }), 'announceLoadedPacks', 'loadPackFrontends'] },
      BUS_CONNECTION_LOST: { actions: 'disconnectPackFrontends' },
      LOAD_PACK_FRONTENDS: { actions: 'loadPackFrontends' },
      PACK_FRONTENDS_SETTLED: { actions: 'finishPackFrontendLoad' },
      PACK_FRONTEND_LOADED: { actions: 'mergePackPlugins' },
      PACK_RUNTIMES_UPDATED: {
        actions: enqueueActions(({ context, event, enqueue }) => {
          const { runtimes } = typeOf('PACK_RUNTIMES_UPDATED', event);
          const accepted = context.acceptedPackRuntimes;
          enqueue.sendTo(context.entityOpening, { type: 'RUNTIMES_UPDATED', runtimes });
          if (Object.keys(accepted).length !== Object.keys(runtimes).length
            || Object.entries(runtimes).some(([id, revision]) => accepted[id] !== revision)) {
            enqueue.raise({ type: 'LOAD_PACK_FRONTENDS' });
          }
        }),
      },
      PACK_PLUGINS_UNLOADED: { actions: 'removePackPlugins' },
      PLUGIN_VISIBILITY_UPDATED: { actions: 'updatePluginVisibility' },
      SET_PLUGIN_VISIBILITY: { actions: 'setPluginVisibility' },
      OPEN_ENTITY: { actions: 'beginEntityOpen' },
      ENTITY_OPEN_FINISHED: { actions: assign(({ context, event }) => ({ awaitingPlugin: context.awaitingPlugin.filter(request => request.entityToken !== event.token) })) },
      OPEN_PLUGIN: { actions: 'selectAndDeliver' },
      SEND_TO_PLUGIN: { actions: 'deliverWithoutSelecting' },
      // A backend's request: a main window opens the plugin, a popout keeps the one it shows
      OPEN_PLUGIN_FROM_APP: { guard: 'isMainWindow', actions: 'checkBackendOpenRequest' },
      DELIVER_PLUGIN_EVENTS: { actions: 'deliverPluginEvents' },
      TRAIL_UPDATE: { actions: ['setBreadcrumbs', 'setTargetView'] },
      TRAIL_CLICK: { actions: ['setTargetView', 'sendRouteClick'] },
      DEFAULT_TOGGLE: { actions: ['trailNewPlugin', 'toggleCanvas'] },
      SELECT_PLUGIN: { actions: ['cancelEntityOpen', 'setActivePlugin', 'trailNewPlugin'] },
      SELECT_OPENED_PLUGIN: { actions: ['setActivePlugin', 'trailNewPlugin'] },
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
