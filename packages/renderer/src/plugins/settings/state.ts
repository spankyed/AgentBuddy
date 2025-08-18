import { assign, setup, type ActorRefFrom } from 'xstate'
import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb'
import { safeEvents } from '@/core/types/safe-events'
import {
  targetIs,
  TRAIL_CLICK,
  type TrailClickEvent,
} from '@/core/actors/route-trailer'
import type { EARS } from '@app/api'
import { trpc } from '@/core/trpc'

/* ─────────────────────────────────────────────────────────── */
/* Machine Types                                               */
/* ─────────────────────────────────────────────────────────── */
export const id = 'settings'
export type SettingsState = ActorRefFrom<typeof settingsState>

export interface PersonalInfo {
  name?: string;
  phoneNumber?: string;
  address?: string;
}

export interface ApiKeys {
  google?: string;
  anthropic?: string;
  openai?: string;
}

export interface Hotkeys {
  switchPluginUp?: {
    key: string;
    modifiers: string[];
  };
  switchPluginDown?: {
    key: string;
    modifiers: string[];
  };
  toggleInspectionPanel?: {
    key: string;
    modifiers: string[];
  };
}

export interface GeneralSettings {
  personal: PersonalInfo;
  apiKeys: ApiKeys;
  hotkeys: Hotkeys;
  misc: any;
}

export interface PluginSettings {
  [pluginId: string]: any;
}

export interface SettingsData {
  general: GeneralSettings;
  plugins: PluginSettings;
}

export interface SettingsContext {
  settings: SettingsData | null;
  activeTab: 'general' | 'plugins' | 'help';
  generalNavItem: 'personal' | 'apiKeys' | 'hotkeys' | 'misc';
  selectedPluginId: string | null;
  isLoading: boolean;
}

type SystemEvent = 
  | { type: 'SETTINGS_LOADED'; data: SettingsData }
  | { type: 'SETTINGS_UPDATED'; data: SettingsData }
  | { type: 'SETTINGS_RESET'; data: SettingsData }

type UIEvent =
  | { type: 'TAB.SELECT'; tab: 'general' | 'plugins' | 'help' }
  | { type: 'GENERAL_NAV.SELECT'; item: 'personal' | 'apiKeys' | 'hotkeys' | 'misc' }
  | { type: 'PLUGIN.SELECT'; pluginId: string }
  | { type: 'SETTINGS.UPDATE'; entityType: 'general' | 'plugin'; label: string; path: string[]; value: any }
  | { type: 'SETTINGS.RESET' }
  | { type: 'SETTINGS.LOAD' }

export type SettingsEvents = UIEvent | SystemEvent | TrailClickEvent
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
        systemId: id as any,
        type: 'GET_SETTINGS' as any,
      });
    },

    setSettingsData: assign(({ event }) => {
      const ev = typeOf('SETTINGS_LOADED', event);
      return {
        settings: ev.data,
        isLoading: false,
      }
    }),

    updateSettingsData: assign(({ event }) => {
      const ev = typeOf('SETTINGS_UPDATED', event);
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
        systemId: id as any,
        type: 'UPDATE_SETTINGS' as any,
        entityType: ev.entityType,
        label: ev.label,
        path: ev.path,
        value: ev.value,
      });
    },

    resetSettings: () => {
      trpc.bus.send.mutate({
        systemId: id as any,
        type: 'RESET_SETTINGS' as any,
      });
    },
  },
}).createMachine({
  id,
  initial: 'loading',
  context: {
    settings: null,
    activeTab: 'general',
    generalNavItem: 'personal',
    selectedPluginId: null,
    isLoading: true,
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