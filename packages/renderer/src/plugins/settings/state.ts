import { assign, setup, type ActorRefFrom } from 'xstate'
import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb'
import { safeEvents } from '@/core/types/safe-events'
import {
  targetIs,
  TRAIL_CLICK,
  type TrailClickEvent,
} from '@/core/actors/route-trailer'
import type { EARS, OutgoingSettingsEvents, SettingsData, GeneralSettings, PersonalInfo, Secrets, ApplicationHotkeys, PluginSettings } from '@app/api'
import { trpc } from '@/core/trpc'
import plugins from '@/plugins'
import { applicationState } from '@/main'

/* ─────────────────────────────────────────────────────────── */
/* Machine Types                                               */
/* ─────────────────────────────────────────────────────────── */
export const id = 'settings'
export type SettingsState = ActorRefFrom<typeof settingsState>

// Use backend types directly

export interface SetupPackImport {
  status: 'idle' | 'importing' | 'success' | 'error';
  result: any | null;
  error: string | null;
}

export interface SettingsContext {
  settings: SettingsData | null;
  secretsData: any[];
  cliTestResults: Record<string, { status: 'idle' | 'testing' | 'success' | 'error'; resolvedPath?: string; error?: string }>;
  setupPackImport: SetupPackImport;
  activeTab: 'general' | 'plugins' | 'help';
  generalNavItem: 'personal' | 'secrets' | 'hotkeys' | 'projects' | 'misc';
  selectedPluginId: string | null;
  isLoading: boolean;
}
type UIEvent =
  | { type: 'TAB.SELECT'; tab: 'general' | 'plugins' | 'help' }
  | { type: 'GENERAL_NAV.SELECT'; item: 'personal' | 'secrets' | 'hotkeys' | 'projects' | 'misc' }
  | { type: 'PLUGIN.SELECT'; pluginId: string }
  | { type: 'SETTINGS.UPDATE'; entityType: 'general' | 'plugin'; label: string; path: string[]; value: any }
  | { type: 'SETTINGS.RESET' }
  | { type: 'SETTINGS.LOAD' }
  | { type: 'CLI.TEST'; provider: string }
  | { type: 'SETUP_PACK.IMPORT'; directory: string }
  | { type: 'SETUP_PACK.RESET_STATUS' }

export type SettingsEvents = UIEvent | OutgoingSettingsEvents | TrailClickEvent
  | { type: 'SETUP_PACK_IMPORTED'; result: any }
  | { type: 'SETUP_PACK_IMPORT_FAILED'; error: string }
  | { type: 'SECRETS.EVENT.LOADED'; data: any[] }
  | { type: 'SECRETS.EVENT.CREATED'; id: string; provider: string; customName?: string }
  | { type: 'SECRETS.EVENT.UPDATED'; id: string }
  | { type: 'SECRETS.EVENT.DELETED'; id: string }
  | { type: 'SECRETS.EVENT.ERROR'; message: string }
  | { type: 'CLI_TEST_RESULT'; provider: string; success: boolean; error?: string; resolvedPath?: string }
const typeOf = safeEvents<SettingsEvents>()

const settingsState = setup({
  types: {
    context: {} as SettingsContext,
    events: {} as SettingsEvents,
  },
  actions: {
    /* ── bootstrap ─────────────────────────────────────── */
    loadSettings: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'GET_SETTINGS',
      });
    },

    setSettingsData: assign(({ event }) => {
      const ev = typeOf('SETTINGS_LOADED', event);
      
      // Send plugin visibility to application state on initial load
      if (ev.data?.plugins?._meta?.visibility) {
        applicationState.send({
          type: 'PLUGIN_VISIBILITY_UPDATED',
          pluginVisibility: ev.data.plugins._meta.visibility
        });
      }
      
      return {
        settings: ev.data,
        isLoading: false,
      }
    }),

    setSecretsData: assign(({ event }) => {
      const ev = event as { type: 'SECRETS.EVENT.LOADED'; data: any[] };
      return {
        secretsData: ev.data
      };
    }),

    updateSettingsData: assign(({ event }) => {
      const ev = typeOf('SETTINGS_UPDATED', event);
      
      // Send plugin visibility updates to application state
      if (ev.data?.plugins?._meta?.visibility) {
        applicationState.send({
          type: 'PLUGIN_VISIBILITY_UPDATED',
          pluginVisibility: ev.data.plugins._meta.visibility
        });
      }
      
      return {
        settings: ev.data,
      }
    }),

    /* ── tab navigation ────────────────────────────────── */
    selectTab: assign(({ event }) => {
      const ev = typeOf('TAB.SELECT', event);
      return {
        activeTab: ev.tab,
      }
    }),

    selectGeneralNavItem: assign(({ event }) => {
      const ev = typeOf('GENERAL_NAV.SELECT', event);
      return {
        generalNavItem: ev.item,
      }
    }),

    selectPlugin: assign(({ event }) => {
      const ev = typeOf('PLUGIN.SELECT', event);
      return {
        selectedPluginId: ev.pluginId,
      }
    }),

    /* ── settings updates ────────────────────────────── */
    updateSettings: ({ event }) => {
      const ev = typeOf('SETTINGS.UPDATE', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_SETTINGS',
        entityType: ev.entityType,
        label: ev.label,
        path: ev.path,
        value: ev.value,
      });
    },

    resetSettings: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'RESET_SETTINGS',
      });
    },

    testCliProvider: assign(({ context, event }) => {
      const ev = typeOf('CLI.TEST', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'TEST_CLI_PROVIDER',
        provider: ev.provider,
      });
      return {
        cliTestResults: { ...context.cliTestResults, [ev.provider]: { status: 'testing' as const } },
      };
    }),

    setCliTestResult: assign(({ context, event }) => {
      const ev = event as { type: 'CLI_TEST_RESULT'; provider: string; success: boolean; error?: string; resolvedPath?: string };
      return {
        cliTestResults: {
          ...context.cliTestResults,
          [ev.provider]: {
            status: ev.success ? 'success' as const : 'error' as const,
            resolvedPath: ev.resolvedPath,
            error: ev.error,
          },
        },
      };
    }),

    importSetupPack: assign(({ event }) => {
      const ev = event as { type: 'SETUP_PACK.IMPORT'; directory: string };
      trpc.bus.send.mutate({
        systemId: id,
        type: 'IMPORT_SETUP_PACK',
        directory: ev.directory,
      } as any);
      return {
        setupPackImport: { status: 'importing' as const, result: null, error: null },
      };
    }),

    setSetupPackImported: assign(({ event }) => {
      const ev = event as { type: 'SETUP_PACK_IMPORTED'; result: any };
      return {
        setupPackImport: { status: 'success' as const, result: ev.result, error: null },
      };
    }),

    setSetupPackImportFailed: assign(({ event }) => {
      const ev = event as { type: 'SETUP_PACK_IMPORT_FAILED'; error: string };
      return {
        setupPackImport: { status: 'error' as const, result: null, error: ev.error },
      };
    }),

    resetSetupPackStatus: assign(() => ({
      setupPackImport: { status: 'idle' as const, result: null, error: null },
    })),
  },
}).createMachine({
  id,
  initial: 'loading',
  context: () => {
    // Get plugins with settings
    const pluginsWithSettings = plugins.filter(plugin => plugin.settings)
    // Set first plugin as default if available
    const defaultPluginId = pluginsWithSettings.length > 0 ? pluginsWithSettings[0].id : null
    
    return {
      settings: null,
      secretsData: [],
      cliTestResults: {},
      setupPackImport: { status: 'idle', result: null, error: null },
      activeTab: 'general',
      generalNavItem: 'personal',
      selectedPluginId: defaultPluginId,
      isLoading: true,
    }
  },
  states: {
    loading: {
      entry: 'loadSettings',
      on: {
        SETTINGS_LOADED: {
          target: 'ready',
          actions: 'setSettingsData',
        },
      },
    },
    ready: {
      meta: breadcrumb('settings', 'Settings', true),
      on: {
        'TAB.SELECT': {
          actions: 'selectTab',
        },
        'GENERAL_NAV.SELECT': {
          actions: 'selectGeneralNavItem',
        },
        'PLUGIN.SELECT': {
          actions: 'selectPlugin',
        },
        'SETTINGS.UPDATE': {
          actions: 'updateSettings',
        },
        'SETTINGS.RESET': {
          actions: 'resetSettings',
        },
        'SETTINGS.LOAD': {
          target: 'loading',
        },
        SETTINGS_UPDATED: {
          actions: 'updateSettingsData',
        },
        SETTINGS_RESET: {
          actions: 'updateSettingsData',
        },
        'SECRETS.EVENT.LOADED': {
          actions: 'setSecretsData',
        },
        'SECRETS.EVENT.CREATED': {},
        'SECRETS.EVENT.UPDATED': {},
        'SECRETS.EVENT.DELETED': {},
        'SECRETS.EVENT.ERROR': {},
        'CLI.TEST': {
          actions: 'testCliProvider',
        },
        'CLI_TEST_RESULT': {
          actions: 'setCliTestResult',
        },
        'SETUP_PACK.IMPORT': {
          actions: 'importSetupPack',
        },
        'SETUP_PACK.RESET_STATUS': {
          actions: 'resetSetupPackStatus',
        },
        SETUP_PACK_IMPORTED: {
          actions: 'setSetupPackImported',
        },
        SETUP_PACK_IMPORT_FAILED: {
          actions: 'setSetupPackImportFailed',
        },
      },
    },
  },
});

export default settingsState;