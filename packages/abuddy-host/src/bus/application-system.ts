// The host's `application` feature on the backend: the app shell's own state, which plugins' sidebar tabs show and
// the plugin the user last had open. It lives in AppState because no pack owns the shell; the renderer's
// application actor is its plugin.
import { setup } from 'xstate';
import { sendToPlugin } from '@abuddy/sdk/events';
import { addressPluginKeys, pluginRefOf, type PluginOwners } from '@abuddy/sdk/framework';
import { HOST_PACK_ID, resolveName, splitRef } from '@abuddy/sdk/ids';
import { appState } from '../app-state/index.ts';
import type { PackRegistry } from '../packs/pack-registration.ts';

/** The host `application` feature's ref, which this system and the renderer's application actor run under */
export const application = resolveName('application', HOST_PACK_ID);

/** Which plugins' tabs show, by ref: each feature's declared default, with the user's own choices over it */
export function pluginVisibility(registry: Pick<PackRegistry, 'settingsDefaults'>): Record<string, boolean> {
  return { ...registry.settingsDefaults().visibility, ...appState.get().pluginVisibility };
}

/**
 * Moves the shell's state stored under a bare feature id onto the ref of the plugin that now owns it (`PluginOwners`).
 * 0.3.15 keeps such an id when no registered plugin owned it then (its pack was disabled), so the user's choice
 * reaches the pack's plugin once the pack registers, as its plugin settings do.
 */
export function addressShellState(owners: PluginOwners): void {
  const { pluginVisibility, lastActivePlugin } = appState.get();
  const visibility = addressPluginKeys(pluginVisibility, owners);
  const lastActive = lastActivePlugin && !splitRef(lastActivePlugin) ? pluginRefOf(lastActivePlugin, owners) : undefined;
  if (visibility.moved === 0 && !lastActive) return;
  appState.update({
    ...(visibility.moved > 0 && { pluginVisibility: visibility.record }),
    ...(lastActive && { lastActivePlugin: lastActive }),
  });
}

/** The plugins a bare id may stand for: every registered plugin, a built-in pack's winning a shared id */
export const pluginOwners = (registry: Pick<PackRegistry, 'pluginIds' | 'builtInPacks'>): PluginOwners => ({
  refs: registry.pluginIds(),
  builtIn: registry.builtInPacks().map(({ id }) => id),
});

type ApplicationEvent =
  | { type: 'SET_PLUGIN_VISIBILITY'; pluginId: string; visible: boolean }
  | { type: 'SET_LAST_ACTIVE_PLUGIN'; pluginId: string }
  | { type: 'PACK_CHANGED'; packId: string };

/** The events a client may send this system */
export const APPLICATION_SYSTEM_EVENTS = ['SET_PLUGIN_VISIBILITY', 'SET_LAST_ACTIVE_PLUGIN'] as const;

/**
 * The host `application` system over the packs in `registry`. It records the user's choices, and sends the
 * application plugin the visibility again when a choice or a pack's defaults change, so every window agrees.
 */
export function createApplicationSystem(registry: Pick<PackRegistry, 'settingsDefaults' | 'pluginIds' | 'builtInPacks'>) {
  return setup({
    types: { events: {} as ApplicationEvent },
    actions: {
      addressShellState: () => addressShellState(pluginOwners(registry)),
      sendVisibility: () => {
        sendToPlugin(application, { type: 'PLUGIN_VISIBILITY_UPDATED', pluginVisibility: pluginVisibility(registry) });
      },
    },
  }).createMachine({
    id: 'application',
    on: {
      SET_PLUGIN_VISIBILITY: {
        // A plugin id that isn't a ref names no plugin, so nothing could ever read the choice back
        guard: ({ event }) => splitRef(event.pluginId) !== undefined,
        actions: [
          ({ event }) => appState.update({ pluginVisibility: { ...appState.get().pluginVisibility, [event.pluginId]: event.visible } }),
          'sendVisibility',
        ],
      },
      SET_LAST_ACTIVE_PLUGIN: {
        guard: ({ event }) => splitRef(event.pluginId) !== undefined,
        actions: ({ event }) => appState.update({ lastActivePlugin: event.pluginId }),
      },
      // A pack coming or going brings or takes its features' defaults, and a pack coming owns the choices kept
      // under its features' bare ids
      PACK_CHANGED: { actions: ['addressShellState', 'sendVisibility'] },
    },
  });
}
