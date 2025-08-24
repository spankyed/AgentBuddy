import { assign, setup, type ActorRefFrom } from 'xstate'
import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb'
import { safeEvents } from '@/core/types/safe-events'
import {
  targetIs,
  TRAIL_CLICK,
  type TrailClickEvent,
} from '@/core/actors/route-trailer'
import type { EARS, OutgoingSettingsEvents, SettingsData, GeneralSettings, PersonalInfo, ApiKeys, ApplicationHotkeys, PluginSettings } from '@app/api'
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
  activeTab: 'general' | 'plugins' | 'help';
  generalNavItem: 'personal' | 'apiKeys' | 'hotkeys' | 'misc';
  selectedPluginId: string | null;
  isLoading: boolean;
}
type UIEvent =
  | { type: 'TAB.SELECT'; tab: 'general' | 'plugins' | 'help' }
  | { type: 'GENERAL_NAV.SELECT'; item: 'personal' | 'apiKeys' | 'hotkeys' | 'misc' }
  | { type: 'PLUGIN.SELECT'; pluginId: string }
  | { type: 'SETTINGS.UPDATE'; entityType: 'general' | 'plugin'; label: string; path: string[]; value: any }
  | { type: 'SETTINGS.RESET' }
  | { type: 'SETTINGS.LOAD' }

export type SettingsEvents = UIEvent | OutgoingSettingsEvents | TrailClickEvent
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
      if (ev.data?.general?.pluginVisibility) {
        applicationState.send({
          type: 'PLUGIN_VISIBILITY_UPDATED',
          pluginVisibility: ev.data.general.pluginVisibility
        });
      }
      
      return {
        settings: ev.data,
        isLoading: false,
      }
    }),

    updateSettingsData: assign(({ event }) => {
      const ev = typeOf('SETTINGS_UPDATED', event);
      
      // Send plugin visibility updates to application state
      if (ev.data?.general?.pluginVisibility) {
        applicationState.send({
          type: 'PLUGIN_VISIBILITY_UPDATED',
          pluginVisibility: ev.data.general.pluginVisibility
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
      },
    },
  },
});

export default settingsState;