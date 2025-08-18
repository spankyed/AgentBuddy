import { createMachine, setup } from 'xstate';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, safeEvents } from '@/core/utils/actor-helpers';
import { EARS } from '@/core/types';
import { SettingsEntity, SettingsData } from './types';
import { settingsQueries, settingsCommands } from './repository';
import { z } from 'zod';
import { createLogger } from '@/core/utils/debug/logger';

const logger = createLogger('settings');
const typeOf = safeEvents<ReceivableEvents>();

export const settings = 'settings' as const;

const busEvent = systemBus(settings);

export const IncomingSettingsEvents = [
  busEvent('GET_SETTINGS', {}),
  busEvent('UPDATE_GENERAL_SETTINGS', { 
    general: z.object({
      personal: z.object({
        name: z.string().optional(),
        phoneNumber: z.string().optional(),
        address: z.string().optional()
      }).optional(),
      apiKeys: z.object({
        google: z.string().optional(),
        anthropic: z.string().optional(),
        openai: z.string().optional()
      }).optional(),
      hotkeys: z.object({
        switchPluginUp: z.object({
          key: z.string(),
          modifiers: z.array(z.string())
        }).optional(),
        switchPluginDown: z.object({
          key: z.string(),
          modifiers: z.array(z.string())
        }).optional(),
        toggleInspectionPanel: z.object({
          key: z.string(),
          modifiers: z.array(z.string())
        }).optional()
      }).optional(),
      misc: z.object({}).optional()
    }).partial()
  }),
  busEvent('UPDATE_PLUGIN_SETTINGS', { 
    pluginId: z.string(),
    settings: z.any()
  }),
  busEvent('UPDATE_PERSONAL_INFO', {
    name: z.string().optional(),
    phoneNumber: z.string().optional(),
    address: z.string().optional()
  }),
  busEvent('UPDATE_API_KEYS', {
    google: z.string().optional(),
    anthropic: z.string().optional(),
    openai: z.string().optional()
  }),
  busEvent('UPDATE_HOTKEYS', {
    switchPluginUp: z.object({
      key: z.string(),
      modifiers: z.array(z.string())
    }).optional(),
    switchPluginDown: z.object({
      key: z.string(),
      modifiers: z.array(z.string())
    }).optional(),
    toggleInspectionPanel: z.object({
      key: z.string(),
      modifiers: z.array(z.string())
    }).optional()
  }),
  busEvent('UPDATE_CUSTOM_HOTKEYS', {
    custom: z.array(z.object({
      id: z.string(),
      eventName: z.string(),
      key: z.string(),
      modifiers: z.array(z.string())
    }))
  }),
  busEvent('RESET_SETTINGS', {}),
] as const

export type SettingsInternalEvents = 
  | SystemEvents

export type OutgoingSettingsEvents =
  | { type: 'SETTINGS_LOADED'; data: SettingsData }
  | { type: 'SETTINGS_UPDATED'; data: SettingsData }
  | { type: 'SETTINGS_RESET'; data: SettingsData }
  | { type: 'SETTINGS_ERROR'; error: string }

export const SettingsSystemEvents = fromSystem(IncomingSettingsEvents)<OutgoingSettingsEvents, typeof settings>()
type ReceivableEvents = MergeReceivable<typeof IncomingSettingsEvents, SettingsInternalEvents>;

export const settingsSystem = setup({
  types: {
    context: {} as {},
    events: {} as ReceivableEvents,
  },
  actions: {
    sendSettingsStartupData: ({ system }) => {
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, { 
        type: 'SETTINGS_LOADED',
        data
      }));
    },
    
    getSettings: ({ system, event }) => {
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_LOADED',
        data
      }));
    },
    
    updateGeneralSettings: ({ system, event }) => {
      const ev = typeOf('UPDATE_GENERAL_SETTINGS', event);
      settingsCommands.updateGeneralSettings(ev.general);
      
      // Get all settings to send to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_UPDATED',
        data
      }));
    },
    
    updatePluginSettings: ({ system, event }) => {
      const ev = typeOf('UPDATE_PLUGIN_SETTINGS', event);
      settingsCommands.updatePluginSettings(ev.pluginId, ev.settings);
      
      // Get all settings to send to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_UPDATED',
        data
      }));
    },
    
    updatePersonalInfo: ({ system, event }) => {
      const ev = typeOf('UPDATE_PERSONAL_INFO', event);
      settingsCommands.updatePersonalInfo(ev);
      
      // Get all settings to send to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_UPDATED',
        data
      }));
    },
    
    updateApiKeys: ({ system, event }) => {
      const ev = typeOf('UPDATE_API_KEYS', event);
      settingsCommands.updateApiKeys(ev);
      
      // Get all settings to send to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_UPDATED',
        data
      }));
    },
    
    updateHotkeys: ({ system, event }) => {
      const ev = typeOf('UPDATE_HOTKEYS', event);
      settingsCommands.updateHotkeys(ev);
      
      // Get all settings to send to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_UPDATED',
        data
      }));
    },
    
    updateCustomHotkeys: ({ system, event }) => {
      const ev = typeOf('UPDATE_CUSTOM_HOTKEYS', event);
      settingsCommands.updateCustomHotkeys(ev.custom);
      
      // Get all settings to send to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_UPDATED',
        data
      }));
    },
    
    resetSettings: ({ system, event }) => {
      settingsCommands.resetSettings();
      
      // After reset, get the new settings to send to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_RESET',
        data
      }));
    },
  },
}).createMachine({
  id: settings,
  initial: 'idle',
  context: {},
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: {
          actions: 'sendSettingsStartupData',
        },
        GET_SETTINGS: {
          actions: 'getSettings',
        },
        UPDATE_GENERAL_SETTINGS: {
          actions: 'updateGeneralSettings',
        },
        UPDATE_PLUGIN_SETTINGS: {
          actions: 'updatePluginSettings',
        },
        UPDATE_PERSONAL_INFO: {
          actions: 'updatePersonalInfo',
        },
        UPDATE_API_KEYS: {
          actions: 'updateApiKeys',
        },
        UPDATE_HOTKEYS: {
          actions: 'updateHotkeys',
        },
        UPDATE_CUSTOM_HOTKEYS: {
          actions: 'updateCustomHotkeys',
        },
        RESET_SETTINGS: {
          actions: 'resetSettings',
        },
      },
    },
  },
});