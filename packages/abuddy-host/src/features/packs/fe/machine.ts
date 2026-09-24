// The Packs plugin's machine: what the Packs view shows and what it asks the `host/packs` system for. It runs in
// the renderer, which pairs it with the view's components, and lives here beside that system and the shell for the
// same reason the system doesn't live in the API — it decides things, and deciding isn't rendering.
import { assign, setup, type ActorRefFrom } from 'xstate';
import { breadcrumb, safeEvents } from '@abuddy/sdk/fe';
import { sendToSystem } from '../../../events.ts';
import type { PackInfo } from '../../../packs/registry.ts';
import { HOST } from '../../../refs.ts';

export type { PackInfo };

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

    // The shell owns pack frontends: it unloads this one's and drops its plugins, as it loads them on activation
    onPackDeactivated: ({ system, event }) => {
      const ev = typeOf('PACK_DEACTIVATED', event);
      system.get(HOST.application).send({ type: 'PACK_PLUGINS_UNLOADED', packId: ev.packId });
    },

    // The application actor owns pack frontend loading — it loads the packs it hasn't yet, this one
    // included, and reports a failure the same way wherever the load was asked for
    onPackActivated: ({ system }) => {
      system.get(HOST.application).send({ type: 'LOAD_PACK_FRONTENDS' });
    },

    sendInstall: ({ event }) => {
      const ev = typeOf('UI.INSTALL', event);
      sendToSystem(HOST.packs, { type: 'INSTALL_PACK', packSlug: ev.packSlug, source: ev.source });
    },

    promptUninstall: assign({
      confirmingUninstall: ({ event }) => typeOf('UI.CONFIRM_UNINSTALL', event).packId,
    }),

    cancelUninstall: assign({
      confirmingUninstall: () => null,
    }),

    sendUninstall: ({ event }) => {
      const ev = typeOf('UI.UNINSTALL', event);
      sendToSystem(HOST.packs, { type: 'UNINSTALL_PACK', packId: ev.packId });
    },

    clearUninstallPrompt: assign({
      confirmingUninstall: () => null,
    }),

    sendToggleEnabled: ({ event }) => {
      const ev = typeOf('UI.TOGGLE_ENABLED', event);
      sendToSystem(HOST.packs, { type: 'TOGGLE_PACK_ENABLED', packId: ev.packId });
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
      sendToSystem(HOST.packs, { type: 'UPDATE_PACK', packId: ev.packId });
    },

    sendCheckUpdates: () => {
      sendToSystem(HOST.packs, { type: 'CHECK_FOR_UPDATES' });
    },

    sendRefresh: () => {
      sendToSystem(HOST.packs, { type: 'GET_INSTALLED_PACKS' });
    },
  },
}).createMachine({
  id: HOST.packs,
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
      meta: breadcrumb('idle', 'Packs', true),
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
