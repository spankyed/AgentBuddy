import { assign, setup, type ActorRefFrom } from 'xstate';
import { safeEvents } from '@abuddy/sdk/fe';
import { registerPackFE, unregisterPackFE } from '@abuddy/sdk/fe/host';
import { trpc } from '@abuddy/sdk/rpc';
import type { PackInfo } from '@abuddy/sdk/packs';
import { application } from '@/core/actors/application';
import { loadPackFEEntry, loadPackPlugins, loadPackStyles } from './pack-loader';

export type { PackInfo };

export const id = 'packs';

export interface PacksContext {
  packs: PackInfo[];
  selectedPackId: string | null;
  installing: string | null;
  confirmingUninstall: string | null;
  updatingPackId: string | null;
  error: string | null;
}

type PacksEvent =
  | { type: 'CLIENT_CONNECTED' }
  | { type: 'PACKS_LIST'; packs: PackInfo[] }
  | { type: 'PACK_INSTALL_STARTED'; packSlug: string }
  | { type: 'PACK_INSTALL_COMPLETE'; packSlug: string; packId: string; packName: string; version: string }
  | { type: 'PACK_INSTALL_FAILED'; packSlug: string; error: string }
  | { type: 'PACK_UNINSTALL_COMPLETE'; packId: string }
  | { type: 'PACK_UNINSTALL_FAILED'; packId: string; error: string }
  | { type: 'PACK_ENABLED_CHANGED'; packId: string; enabled: boolean }
  | { type: 'PACK_ACTIVATED'; packId: string }
  | { type: 'PACK_DEACTIVATED'; packId: string }
  | { type: 'PACK_UPDATE_COMPLETE'; packId: string; version: string }
  | { type: 'PACK_UPDATE_FAILED'; packId: string; error: string }
  | { type: 'UI.INSTALL'; packSlug: string; source?: string }
  | { type: 'UI.UNINSTALL'; packId: string }
  | { type: 'UI.CONFIRM_UNINSTALL'; packId: string }
  | { type: 'UI.CANCEL_UNINSTALL' }
  | { type: 'UI.TOGGLE_ENABLED'; packId: string }
  | { type: 'UI.SELECT_PACK'; packId: string }
  | { type: 'UI.BACK' }
  | { type: 'UI.DISMISS_ERROR' }
  | { type: 'UI.REFRESH' }
  | { type: 'UI.UPDATE'; packId: string }
  | { type: 'UI.CHECK_UPDATES' }

const typeOf = safeEvents<PacksEvent>();

const packsState = setup({
  types: {
    context: {} as PacksContext,
    events: {} as PacksEvent,
  },
  actions: {
    setPacksList: assign({
      packs: ({ event }) => typeOf('PACKS_LIST', event).packs,
      error: () => null,
    }),

    setInstalling: assign({
      installing: ({ event }) => typeOf('PACK_INSTALL_STARTED', event).packSlug,
      error: () => null,
    }),

    onInstallComplete: assign({
      installing: () => null,
    }),

    onInstallFailed: assign({
      installing: () => null,
      error: ({ event }) => typeOf('PACK_INSTALL_FAILED', event).error,
    }),

    onUninstallFailed: assign({
      error: ({ event }) => typeOf('PACK_UNINSTALL_FAILED', event).error,
    }),

    onEnabledChanged: assign({
      packs: ({ context, event }) => {
        const ev = typeOf('PACK_ENABLED_CHANGED', event);
        return context.packs.map(p =>
          p.id === ev.packId ? { ...p, enabled: ev.enabled } : p
        );
      },
    }),

    onPackDeactivated: ({ system, event }) => {
      const ev = typeOf('PACK_DEACTIVATED', event);
      const removedPlugins = unregisterPackFE(ev.packId);

      // Remove pack stylesheets
      document.querySelectorAll(`link[data-pack-id="${ev.packId}"]`).forEach(el => el.remove());

      if (removedPlugins.length > 0) {
        system.get(application).send({
          type: 'PACK_PLUGINS_UNLOADED',
          pluginIds: removedPlugins.map(p => p.id),
        });
      }
    },

    onPackActivated: ({ system, event }) => {
      const ev = typeOf('PACK_ACTIVATED', event);
      const appActor = system.get(application);

      trpc.packs.registry.query().then(async (registry: any[]) => {
        const pack = registry.find((p: any) => p.id === ev.packId);
        if (!pack) return;

        const packBaseUrl = `pack://${pack.id}`;

        if (pack.feStyles) {
          await loadPackStyles(pack.id, pack.feStyles, packBaseUrl);
        }

        if (pack.feEntry) {
          const registration = await loadPackFEEntry(pack.feEntry, packBaseUrl);
          if (registration) {
            registerPackFE(registration, ev.packId);
            const plugins = registration.plugins ?? [];
            if (plugins.length > 0) {
              appActor.send({ type: 'PACK_PLUGINS_LOADED', plugins });
            }
          }
          return;
        }

        if (pack.plugins.length > 0) {
          const plugins = await loadPackPlugins(
            pack.plugins.map((p: any) => ({ id: p.id, entry: p.entry, label: p.label, icon: p.icon, designation: p.designation })),
            packBaseUrl,
          );
          if (plugins.length > 0) {
            registerPackFE({ plugins }, ev.packId);
            appActor.send({ type: 'PACK_PLUGINS_LOADED', plugins });
          }
        }
      }).catch((err: unknown) => {
        console.error(`[packs] Failed to load FE for pack ${ev.packId}:`, err);
      });
    },

    sendInstall: ({ event }) => {
      const ev = typeOf('UI.INSTALL', event);
      trpc.bus.send.mutate({ systemId: 'packs', type: 'INSTALL_PACK', packSlug: ev.packSlug, source: ev.source });
    },

    promptUninstall: assign({
      confirmingUninstall: ({ event }) => typeOf('UI.CONFIRM_UNINSTALL', event).packId,
    }),

    cancelUninstall: assign({
      confirmingUninstall: () => null,
    }),

    sendUninstall: ({ event }) => {
      const ev = typeOf('UI.UNINSTALL', event);
      trpc.bus.send.mutate({ systemId: 'packs', type: 'UNINSTALL_PACK', packId: ev.packId });
    },

    clearUninstallPrompt: assign({
      confirmingUninstall: () => null,
    }),

    sendToggleEnabled: ({ event }) => {
      const ev = typeOf('UI.TOGGLE_ENABLED', event);
      trpc.bus.send.mutate({ systemId: 'packs', type: 'TOGGLE_PACK_ENABLED', packId: ev.packId });
    },

    selectPack: assign({
      selectedPackId: ({ event }) => typeOf('UI.SELECT_PACK', event).packId,
    }),

    clearSelection: assign({
      selectedPackId: () => null,
    }),

    dismissError: assign({
      error: () => null,
    }),

    onUpdateComplete: assign({
      updatingPackId: () => null,
    }),

    onUpdateFailed: assign({
      updatingPackId: () => null,
      error: ({ event }) => typeOf('PACK_UPDATE_FAILED', event).error,
    }),

    setUpdating: assign({
      updatingPackId: ({ event }) => typeOf('UI.UPDATE', event).packId,
    }),

    sendUpdate: ({ event }) => {
      const ev = typeOf('UI.UPDATE', event);
      trpc.bus.send.mutate({ systemId: 'packs', type: 'UPDATE_PACK', packId: ev.packId });
    },

    sendCheckUpdates: () => {
      trpc.bus.send.mutate({ systemId: 'packs', type: 'CHECK_FOR_UPDATES' });
    },

    sendRefresh: () => {
      trpc.bus.send.mutate({ systemId: 'packs', type: 'GET_INSTALLED_PACKS' });
    },
  },
}).createMachine({
  id,
  initial: 'idle',
  context: {
    packs: [],
    selectedPackId: null,
    installing: null,
    confirmingUninstall: null,
    updatingPackId: null,
    error: null,
  },
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: {},
        PACKS_LIST: { actions: 'setPacksList' },
        PACK_INSTALL_STARTED: { actions: 'setInstalling' },
        PACK_INSTALL_COMPLETE: { actions: 'onInstallComplete' },
        PACK_INSTALL_FAILED: { actions: 'onInstallFailed' },
        PACK_UNINSTALL_COMPLETE: { actions: 'clearUninstallPrompt' },
        PACK_UNINSTALL_FAILED: { actions: ['clearUninstallPrompt', 'onUninstallFailed'] },
        PACK_ENABLED_CHANGED: { actions: 'onEnabledChanged' },
        PACK_ACTIVATED: { actions: 'onPackActivated' },
        PACK_DEACTIVATED: { actions: 'onPackDeactivated' },
        PACK_UPDATE_COMPLETE: { actions: 'onUpdateComplete' },
        PACK_UPDATE_FAILED: { actions: 'onUpdateFailed' },
        'UI.INSTALL': { actions: 'sendInstall' },
        'UI.CONFIRM_UNINSTALL': { actions: 'promptUninstall' },
        'UI.CANCEL_UNINSTALL': { actions: 'cancelUninstall' },
        'UI.UNINSTALL': { actions: 'sendUninstall' },
        'UI.TOGGLE_ENABLED': { actions: 'sendToggleEnabled' },
        'UI.SELECT_PACK': { actions: 'selectPack' },
        'UI.BACK': { actions: 'clearSelection' },
        'UI.DISMISS_ERROR': { actions: 'dismissError' },
        'UI.REFRESH': { actions: 'sendRefresh' },
        'UI.UPDATE': { actions: ['setUpdating', 'sendUpdate'] },
        'UI.CHECK_UPDATES': { actions: 'sendCheckUpdates' },
      },
    },
  },
});

export type PacksState = ActorRefFrom<typeof packsState>;
export default packsState;
