// The host's `application` feature on the backend: the app shell's own state, which plugins' sidebar tabs show and
// the plugin the user last had open. It lives in AppState because no pack owns the shell; the renderer's
// application actor is its plugin.
import { setup } from 'xstate';
import { sendToPlugin } from '@abuddy/sdk/events';
import { splitRef } from '@abuddy/sdk/ids';
import { HOST } from '../host-refs.ts';
import { appState } from '../app-state/index.ts';
import type { PackRegistry } from '../packs/pack-registration.ts';
import { addressStoredPluginKeys } from '../packs/plugin-keys.ts';

/** The host `application` feature's ref, which this system and the renderer's application actor run under */
export const application = HOST.application;

/** Which plugins' tabs show, by ref: each feature's declared default, with the user's own choices over it */
export function pluginVisibility(registry: Pick<PackRegistry, 'settingsDefaults'>): Record<string, boolean> {
  return { ...registry.settingsDefaults().visibility, ...appState.get().pluginVisibility };
}

type ApplicationEvent =
  | { type: 'SET_PLUGIN_VISIBILITY'; plugin: string; visible: boolean }
  | { type: 'SET_LAST_ACTIVE_PLUGIN'; plugin: string }
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
      addressStoredPluginKeys: () => addressStoredPluginKeys(registry),
      sendVisibility: () => {
        sendToPlugin(application, { type: 'PLUGIN_VISIBILITY_UPDATED', pluginVisibility: pluginVisibility(registry) });
      },
    },
  }).createMachine({
    id: 'application',
    on: {
      SET_PLUGIN_VISIBILITY: {
        // A plugin that isn't a ref names no plugin, so nothing could ever read the choice back
        guard: ({ event }) => splitRef(event.plugin) !== undefined,
        actions: [
          ({ event }) => appState.update({ pluginVisibility: { ...appState.get().pluginVisibility, [event.plugin]: event.visible } }),
          'sendVisibility',
        ],
      },
      SET_LAST_ACTIVE_PLUGIN: {
        guard: ({ event }) => splitRef(event.plugin) !== undefined,
        actions: ({ event }) => appState.update({ lastActivePlugin: event.plugin }),
      },
      // A pack coming or going brings or takes its features' defaults, and a pack coming owns what was stored under its
      // features' bare ids before 0.3.15
      PACK_CHANGED: { actions: ['addressStoredPluginKeys', 'sendVisibility'] },
    },
  });
}
