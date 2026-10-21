// The host's `application` feature on the backend: the app shell's own state, which surfaces' sidebar tabs show and
// the surface the user last had open. It lives in AppState because no pack owns the shell; the renderer's
// application actor is its surface.
import { defineHandlers } from '@apackdev/sdk/framework';
import type { MachineContext } from 'xstate';
import { setup } from 'xstate';
import type { ApplicationClientEvent } from '../../event-contracts.ts';
import { broadcastToSurface } from '../../../events.ts';
import { splitRef } from '@apackdev/sdk/ids';
import { appState } from '../../../app-state/index.ts';
import type { PackRegistry } from '../../../packs/registry.ts';

/** Hands each handler the answer for the message it is handling — see `defineHandlers` */
// No context is declared on this machine, so XState's own open `MachineContext` is what its handlers get
const handlers = defineHandlers<MachineContext, ApplicationEvent>();

/** Which surfaces' tabs show, by ref: each feature's declared default, with the user's own choices over it */
export function pluginVisibility(registry: Pick<PackRegistry, 'surfaceDefaults'>): Record<string, boolean> {
  return { ...registry.surfaceDefaults(), ...appState.get().pluginVisibility };
}

type ApplicationEvent = ApplicationClientEvent | { type: 'SEND_STATE' };

/**
 * The host `application` system over the packs in `registry`. It records the user's choices, and sends the
 * application surface the visibility again when a choice or a pack's defaults change, so every window agrees.
 */
export function createApplicationSystem(registry: Pick<PackRegistry, 'surfaceDefaults' | 'loadedPacks' | 'getPackRuntime'>) {
  return setup({
    types: { events: {} as ApplicationEvent },
    actions: handlers.actions({
      sendRuntimes: () => {
        const runtimes = Object.fromEntries(registry.loadedPacks().map(({ id }) => {
          const runtime = registry.getPackRuntime(id);
          if (!runtime) throw new Error(`Pack "${id}" has no accepted runtime identity`);
          return [id, runtime.registrationId];
        }));
        broadcastToSurface('application', { type: 'PACK_RUNTIMES_UPDATED', runtimes });
      },
      sendVisibility: () => {
        broadcastToSurface('application', { type: 'SURFACE_VISIBILITY_UPDATED', pluginVisibility: pluginVisibility(registry) });
      },
    }),
  }).createMachine({
    id: 'application',
    on: {
      SET_SURFACE_VISIBILITY: {
        // A surface that isn't a ref names no surface, so nothing could ever read the choice back
        guard: ({ event }) => splitRef(event.surface) !== undefined,
        actions: [
          ({ event }) => appState.update({ pluginVisibility: { ...appState.get().pluginVisibility, [event.surface]: event.visible } }),
          'sendVisibility',
        ],
      },
      SET_LAST_ACTIVE_SURFACE: {
        guard: ({ event }) => splitRef(event.surface) !== undefined,
        actions: ({ event }) => appState.update({ lastActivePlugin: event.surface }),
      },
      // A pack coming or going brings or takes its features' defaults
      SEND_STATE: { actions: ['sendVisibility', 'sendRuntimes'] },
    },
  });
}
