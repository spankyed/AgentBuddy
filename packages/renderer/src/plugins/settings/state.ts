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
  switchPlugin?: {
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

export interface FAQItem {
  question: string;
  answer: string;
}

export interface SettingsData {
  general: GeneralSettings;
  plugins: PluginSettings;
  faq: {
    items: FAQItem[];
  };
}

export interface SettingsContext {
  settings: SettingsData | null;
  activeTab: 'general' | 'plugins' | 'faq';
  generalNavItem: 'personal' | 'apiKeys' | 'hotkeys' | 'misc';
  selectedPluginId: string | null;
  isLoading: boolean;
  error: string | null;
}

type SystemEvent = 
  | { type: 'SETTINGS_LOADED'; data: { data: SettingsData } }
  | { type: 'SETTINGS_UPDATED'; data: { data: SettingsData } }
  | { type: 'SETTINGS_RESET'; data: { data: SettingsData } }
  | { type: 'SETTINGS_ERROR'; error: string }

type UIEvent =
  | { type: 'TAB.SELECT'; tab: 'general' | 'plugins' | 'faq' }
  | { type: 'GENERAL_NAV.SELECT'; item: 'personal' | 'apiKeys' | 'hotkeys' | 'misc' }
  | { type: 'PLUGIN.SELECT'; pluginId: string }
  | { type: 'PERSONAL.UPDATE'; data: PersonalInfo }
  | { type: 'API_KEYS.UPDATE'; data: ApiKeys }
  | { type: 'HOTKEYS.UPDATE'; data: Hotkeys }
  | { type: 'HOTKEYS.UPDATE_CUSTOM'; data: any[] }
  | { type: 'PLUGIN_SETTINGS.UPDATE'; pluginId: string; settings: any }
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
        settings: ev.data.data,
        isLoading: false,
        error: null,
      }
    }),

    updateSettingsData: assign(({ event }) => {
      const ev = typeOf('SETTINGS_UPDATED', event);
      return {
        settings: ev.data.data,
        error: null,
      }
    }),

    setError: assign(({ event }) => {
      const ev = typeOf('SETTINGS_ERROR', event);
      return {
        error: ev.error,
        isLoading: false,
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
    updatePersonalInfo: ({ event }) => {
      const ev = typeOf('PERSONAL.UPDATE', event);
      trpc.bus.send.mutate({
        systemId: id as any,
        type: 'UPDATE_PERSONAL_INFO' as any,
        ...ev.data,
      });
    },

    updateApiKeys: ({ event }) => {
      const ev = typeOf('API_KEYS.UPDATE', event);
      trpc.bus.send.mutate({
        systemId: id as any,
        type: 'UPDATE_API_KEYS' as any,
        ...ev.data,
      });
    },

    updateHotkeys: ({ event }) => {
      const ev = typeOf('HOTKEYS.UPDATE', event);
      trpc.bus.send.mutate({
        systemId: id as any,
        type: 'UPDATE_HOTKEYS' as any,
        ...ev.data,
      });
    },

    updateCustomHotkeys: ({ event }) => {
      const ev = typeOf('HOTKEYS.UPDATE_CUSTOM', event);
      trpc.bus.send.mutate({
        systemId: id as any,
        type: 'UPDATE_CUSTOM_HOTKEYS' as any,
        custom: ev.data,
      } as any);
    },

    updatePluginSettings: ({ event }) => {
      const ev = typeOf('PLUGIN_SETTINGS.UPDATE', event);
      trpc.bus.send.mutate({
        systemId: id as any,
        type: 'UPDATE_PLUGIN_SETTINGS' as any,
        ...{pluginId: ev.pluginId, settings: ev.settings},
      } as any);
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
    error: null,
  },
  states: {
    loading: {
      entry: 'loadSettings',
      on: {
        SETTINGS_LOADED: {
          target: 'ready',
          actions: 'setSettingsData',
        },
        SETTINGS_ERROR: {
          target: 'error',
          actions: 'setError',
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
        'PERSONAL.UPDATE': {
          actions: 'updatePersonalInfo',
        },
        'API_KEYS.UPDATE': {
          actions: 'updateApiKeys',
        },
        'HOTKEYS.UPDATE': {
          actions: 'updateHotkeys',
        },
        'HOTKEYS.UPDATE_CUSTOM': {
          actions: 'updateCustomHotkeys',
        },
        'PLUGIN_SETTINGS.UPDATE': {
          actions: 'updatePluginSettings',
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
        SETTINGS_ERROR: {
          actions: 'setError',
        },
      },
    },
    error: {
      on: {
        'SETTINGS.LOAD': {
          target: 'loading',
        },
      },
    },
  },
});

export default settingsState;