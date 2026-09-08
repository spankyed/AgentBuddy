import { assign, setup, type ActorRefFrom } from 'xstate';
import { safeEvents } from '@abuddy/sdk/fe';
import { trpc } from '@abuddy/sdk/rpc';

export const id = 'packs';

export interface PackFeatureInfo {
  id: string;
  designation?: string;
  hasSystem: boolean;
  plugin?: { label: string; icon: string; isPinned?: boolean };
  services: string[];
}

export interface PackInfo {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  builtIn: boolean;
  entityCount: number;
  hasFeEntry: boolean;
  hostVersion?: string;
  description?: string;
  entities: Record<string, string>;
  relKinds: Record<string, string>;
  plugins: string[];
  permissions: string[];
  systems: string[];
  services: string[];
  steps: string[];
  artifacts: string[];
  blocks: string[];
  migrationCount: number;
  bootHooks: string[];
  features: PackFeatureInfo[];
  dir?: string;
  registeredAt?: string;
}

export interface PacksContext {
  packs: PackInfo[];
  selectedPackId: string | null;
  installing: string | null;
  confirmingUninstall: string | null;
  pendingChanges: boolean;
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
  | { type: 'UI.INSTALL'; packSlug: string; source?: string }
  | { type: 'UI.UNINSTALL'; packId: string }
  | { type: 'UI.CONFIRM_UNINSTALL'; packId: string }
  | { type: 'UI.CANCEL_UNINSTALL' }
  | { type: 'UI.TOGGLE_ENABLED'; packId: string }
  | { type: 'UI.SELECT_PACK'; packId: string }
  | { type: 'UI.BACK' }
  | { type: 'UI.DISMISS_ERROR' }
  | { type: 'UI.REFRESH' }

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
      pendingChanges: () => true,
    }),

    onInstallFailed: assign({
      installing: () => null,
      error: ({ event }) => typeOf('PACK_INSTALL_FAILED', event).error,
    }),

    onUninstallComplete: assign({
      pendingChanges: () => true,
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
      pendingChanges: () => true,
    }),

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
    pendingChanges: false,
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
        PACK_UNINSTALL_COMPLETE: { actions: ['clearUninstallPrompt', 'onUninstallComplete'] },
        PACK_UNINSTALL_FAILED: { actions: ['clearUninstallPrompt', 'onUninstallFailed'] },
        PACK_ENABLED_CHANGED: { actions: 'onEnabledChanged' },
        'UI.INSTALL': { actions: 'sendInstall' },
        'UI.CONFIRM_UNINSTALL': { actions: 'promptUninstall' },
        'UI.CANCEL_UNINSTALL': { actions: 'cancelUninstall' },
        'UI.UNINSTALL': { actions: 'sendUninstall' },
        'UI.TOGGLE_ENABLED': { actions: 'sendToggleEnabled' },
        'UI.SELECT_PACK': { actions: 'selectPack' },
        'UI.BACK': { actions: 'clearSelection' },
        'UI.DISMISS_ERROR': { actions: 'dismissError' },
        'UI.REFRESH': { actions: 'sendRefresh' },
      },
    },
  },
});

export type PacksState = ActorRefFrom<typeof packsState>;
export default packsState;
