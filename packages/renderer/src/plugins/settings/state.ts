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

export interface SettingsContext {
  settings: SettingsData | null;
  secretsData: any[];
  cliTestResults: Record<string, 'idle' | 'testing' | 'success' | 'error'>;
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

export type SettingsEvents = UIEvent | OutgoingSettingsEvents | TrailClickEvent
  | { type: 'SECRETS.EVENT.LOADED'; data: any[] }
  | { type: 'SECRETS.EVENT.CREATED'; id: string; provider: string; customName?: string }
  | { type: 'SECRETS.EVENT.UPDATED'; id: string }
  | { type: 'SECRETS.EVENT.DELETED'; id: string }
  | { type: 'SECRETS.EVENT.ERROR'; message: string }
  | { type: 'CLI_TEST_RESULT'; provider: string; success: boolean; error?: string }
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
        cliTestResults: { ...context.cliTestResults, [ev.provider]: 'testing' as const },
      };
    }),

    setCliTestResult: assign(({ context, event }) => {
      const ev = event as { type: 'CLI_TEST_RESULT'; provider: string; success: boolean; error?: string };
      return {
        cliTestResults: {
          ...context.cliTestResults,
          [ev.provider]: ev.success ? 'success' as const : 'error' as const,
        },
      };
    }),
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
      },
    },
  },
});

export default settingsState;