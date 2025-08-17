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
        switchPlugin: z.object({
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
    switchPlugin: z.object({
      key: z.string(),
      modifiers: z.array(z.string())
    }).optional()
  }),
  busEvent('RESET_SETTINGS', {}),
] as const

export type SettingsInternalEvents = 
  | SystemEvents

export type OutgoingSettingsEvents =
  | { type: 'SETTINGS_LOADED'; data: SettingsEntity }
  | { type: 'SETTINGS_UPDATED'; data: SettingsEntity }
  | { type: 'SETTINGS_RESET'; data: SettingsEntity }
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
      const result = settingsQueries.getSettings();
      
      if (result.success) {
        system.get(bus).send(emit(settings, { 
          type: 'SETTINGS_LOADED',
          data: result.data
        }));
      } else {
        logger.error('Failed to load settings:', { error: result.error });
        system.get(bus).send(emit(settings, {
          type: 'SETTINGS_ERROR',
          error: result.error
        }));
      }
    },
    
    getSettings: ({ system, event }) => {
      const result = settingsQueries.getSettings();
      
      if (result.success) {
        system.get(bus).send(emit(settings, {
          type: 'SETTINGS_LOADED',
          data: result.data
        }));
      } else {
        logger.error('Failed to get settings:', { error: result.error });
        system.get(bus).send(emit(settings, {
          type: 'SETTINGS_ERROR',
          error: result.error
        }));
      }
    },
    
    updateGeneralSettings: ({ system, event }) => {
      const ev = typeOf('UPDATE_GENERAL_SETTINGS', event);
      const result = settingsCommands.updateGeneralSettings(ev.general);
      
      if (result.success) {
        system.get(bus).send(emit(settings, {
          type: 'SETTINGS_UPDATED',
          data: result.data
        }));
      } else {
        logger.error('Failed to update general settings:', { error: result.error });
        system.get(bus).send(emit(settings, {
          type: 'SETTINGS_ERROR',
          error: result.error
        }));
      }
    },
    
    updatePluginSettings: ({ system, event }) => {
      const ev = typeOf('UPDATE_PLUGIN_SETTINGS', event);
      const result = settingsCommands.updatePluginSettings(ev.pluginId, ev.settings);
      
      if (result.success) {
        system.get(bus).send(emit(settings, {
          type: 'SETTINGS_UPDATED',
          data: result.data
        }));
      } else {
        logger.error('Failed to update plugin settings:', { error: result.error });
        system.get(bus).send(emit(settings, {
          type: 'SETTINGS_ERROR',
          error: result.error
        }));
      }
    },
    
    updatePersonalInfo: ({ system, event }) => {
      const ev = typeOf('UPDATE_PERSONAL_INFO', event);
      const result = settingsCommands.updatePersonalInfo(ev);
      
      if (result.success) {
        system.get(bus).send(emit(settings, {
          type: 'SETTINGS_UPDATED',
          data: result.data
        }));
      } else {
        logger.error('Failed to update personal info:', { error: result.error });
        system.get(bus).send(emit(settings, {
          type: 'SETTINGS_ERROR',
          error: result.error
        }));
      }
    },
    
    updateApiKeys: ({ system, event }) => {
      const ev = typeOf('UPDATE_API_KEYS', event);
      const result = settingsCommands.updateApiKeys(ev);
      
      if (result.success) {
        system.get(bus).send(emit(settings, {
          type: 'SETTINGS_UPDATED',
          data: result.data
        }));
      } else {
        logger.error('Failed to update API keys:', { error: result.error });
        system.get(bus).send(emit(settings, {
          type: 'SETTINGS_ERROR',
          error: result.error
        }));
      }
    },
    
    updateHotkeys: ({ system, event }) => {
      const ev = typeOf('UPDATE_HOTKEYS', event);
      const result = settingsCommands.updateHotkeys(ev);
      
      if (result.success) {
        system.get(bus).send(emit(settings, {
          type: 'SETTINGS_UPDATED',
          data: result.data
        }));
      } else {
        logger.error('Failed to update hotkeys:', { error: result.error });
        system.get(bus).send(emit(settings, {
          type: 'SETTINGS_ERROR',
          error: result.error
        }));
      }
    },
    
    resetSettings: ({ system, event }) => {
      const result = settingsCommands.resetSettings();
      
      if (result.success) {
        system.get(bus).send(emit(settings, {
          type: 'SETTINGS_RESET',
          data: result.data
        }));
      } else {
        logger.error('Failed to reset settings:', { error: result.error });
        system.get(bus).send(emit(settings, {
          type: 'SETTINGS_ERROR',
          error: result.error
        }));
      }
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
        RESET_SETTINGS: {
          actions: 'resetSettings',
        },
      },
    },
  },
});