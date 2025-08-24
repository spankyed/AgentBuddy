import { createMachine, setup } from 'xstate';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, safeEvents } from '@/core/utils/actor-helpers';
import { SettingsData } from './types';
import { settingsQueries, settingsCommands, setupDevelopmentSettings } from './repository';
import { detectAllArrayChanges } from './change-detection';
import { SecretOperations } from './operations/secret-operations';
import { migrateApiKeysToSecrets } from './migration/secrets-migration';
import { z } from 'zod';

const typeOf = safeEvents<ReceivableEvents>();

export const settings = 'settings' as const;

const busEvent = systemBus(settings);

export const IncomingSettingsEvents = [
  busEvent('GET_SETTINGS', {}),
  busEvent('UPDATE_SETTINGS', {
    entityType: z.enum(['general', 'plugin']),
    label: z.string(),
    path: z.array(z.string()),
    value: z.any()
  }),
  busEvent('RESET_SETTINGS', {}),
  busEvent('UPDATE_API_KEY', {
    provider: z.string(),
    value: z.string()
  }),
  busEvent('CREATE_CUSTOM_API_KEY', {
    name: z.string(),
    eventName: z.string(),
    value: z.string(),
    description: z.string().optional()
  }),
  busEvent('DELETE_CUSTOM_API_KEY', {
    id: z.string()
  }),
] as const

export type SettingsInternalEvents = 
  | SystemEvents

export type OutgoingSettingsEvents =
  | { type: 'SETTINGS_LOADED'; data: SettingsData }
  | { type: 'SETTINGS_UPDATED'; data: SettingsData }
  | { type: 'SETTINGS_RESET'; data: SettingsData }
  | { type: 'APPLICATION_HOTKEYS'; hotkeys: SettingsData['general']['hotkeys'] }

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
      
      // Send settings to the settings plugin
      system.get(bus).send(emit('settings', { 
        type: 'SETTINGS_LOADED',
        data
      }));
      
      // Send hotkeys to the application
      system.get(bus).send(emit('application', {
        type: 'APPLICATION_HOTKEYS' as const,
        hotkeys: data.general.hotkeys
      }));
    },
    
    getSettings: ({ system, event }) => {
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit('settings', {
        type: 'SETTINGS_LOADED',
        data
      }));
    },
    
    updateSettings: ({ system, event }) => {
      const ev = typeOf('UPDATE_SETTINGS', event);
      
      // Get previous settings for comparison
      const previousSettings = ev.entityType === 'plugin' 
        ? settingsQueries.getPluginSettings(ev.label) 
        : null;
      
      settingsCommands.updateSettings(ev.entityType, ev.label, ev.path, ev.value);
      
      // Get all settings to send to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit('settings', {
        type: 'SETTINGS_UPDATED',
        data
      }));
      
      // If hotkeys were updated, send them to the application
      // Check if updating entire hotkeys object (label === 'hotkeys') or a specific property
      if (ev.entityType === 'general' && (ev.label === 'hotkeys' || ev.path[0] === 'hotkeys')) {
        system.get(bus).send(emit('application', {
          type: 'APPLICATION_HOTKEYS',
          hotkeys: data.general.hotkeys
        }));
      }
      
      // If plugin settings were updated, forward to both backend and frontend
      if (ev.entityType === 'plugin' && data.plugins) {
        const pluginSettings = data.plugins[ev.label as keyof typeof data.plugins];
        if (pluginSettings) {
          // Detect changes for all arrays in the settings generically
          const changes = detectAllArrayChanges(previousSettings, pluginSettings);
          
          // Send to backend system (if it exists)
          const backendActor = system.get(ev.label as any);
          if (backendActor) {
            const eventType = `${ev.label.toUpperCase()}_SETTINGS_UPDATED`;
            backendActor.send({
              type: eventType,
              settings: pluginSettings,
              changes
            });
          }
          
          // Send settings update event to the frontend plugin
          const eventType = `${ev.label.toUpperCase()}_SETTINGS_UPDATED`;
          system.get(bus).send(emit(ev.label as any, {
            type: eventType,
            settings: pluginSettings
          } as any));
        }
      }
    },
    
    updateApiKey: ({ system, event }) => {
      const ev = typeOf('UPDATE_API_KEY', event);
      const secretOps = new SecretOperations();
      
      secretOps.updateApiKey(ev.provider, ev.value);
      
      // Send updated settings to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit('settings', {
        type: 'SETTINGS_UPDATED',
        data
      }));
    },
    
    createCustomApiKey: ({ system, event }) => {
      const ev = typeOf('CREATE_CUSTOM_API_KEY', event);
      const secretOps = new SecretOperations();
      
      secretOps.createCustomApiKey({
        name: ev.name,
        eventName: ev.eventName,
        value: ev.value,
        description: ev.description
      });
      
      // Send updated settings to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit('settings', {
        type: 'SETTINGS_UPDATED',
        data
      }));
    },
    
    deleteCustomApiKey: ({ system, event }) => {
      const ev = typeOf('DELETE_CUSTOM_API_KEY', event);
      const secretOps = new SecretOperations();
      
      secretOps.deleteCustomApiKey(ev.id);
      
      // Send updated settings to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit('settings', {
        type: 'SETTINGS_UPDATED',
        data
      }));
    },
    
    resetSettings: ({ system, event }) => {
      settingsCommands.resetSettings();
      
      // After reset, get the new settings to send to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit('settings', {
        type: 'SETTINGS_RESET',
        data
      }));
    },
  },
}).createMachine({
  id: settings,
  initial: 'idle',
  context: {},
  entry: () => {
    // Migrate existing API keys to secrets
    migrateApiKeysToSecrets();
    
    // Initialize development settings if needed
    // setupDevelopmentSettings();
  },
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: {
          actions: 'sendSettingsStartupData',
        },
        GET_SETTINGS: {
          actions: 'getSettings',
        },
        UPDATE_SETTINGS: {
          actions: 'updateSettings',
        },
        RESET_SETTINGS: {
          actions: 'resetSettings',
        },
        UPDATE_API_KEY: {
          actions: 'updateApiKey',
        },
        CREATE_CUSTOM_API_KEY: {
          actions: 'createCustomApiKey',
        },
        DELETE_CUSTOM_API_KEY: {
          actions: 'deleteCustomApiKey',
        },
      },
    },
  },
});