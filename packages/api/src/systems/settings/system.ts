import { createMachine, setup, sendTo, enqueueActions } from 'xstate';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, safeEvents } from '@/core/utils/actor-helpers';
import { SettingsData } from './types';
import { settingsQueries, settingsCommands, setupDevelopmentSettings } from './repository';
import { secretsActor } from '../secrets/system';
import type { SecretsOutputEvents } from '../secrets/system';
import { detectAllArrayChanges } from './change-detection';
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
  // Secret management events
  busEvent('SECRETS.CMD.CREATE_API_KEY', {
    provider: z.string(),
    value: z.string(),
    customName: z.string().optional()
  }),
  busEvent('SECRETS.CMD.UPDATE_API_KEY', {
    id: z.string(),
    value: z.string()
  }),
  busEvent('SECRETS.CMD.DELETE_API_KEY', {
    id: z.string()
  }),
  busEvent('SECRETS.CMD.GET_API_KEYS', {}),
] as const

export type SettingsInternalEvents = 
  | SystemEvents
  | SecretsOutputEvents // Events from child secrets actor

export type OutgoingSettingsEvents =
  | { type: 'SETTINGS_LOADED'; data: SettingsData }
  | { type: 'SETTINGS_UPDATED'; data: SettingsData }
  | { type: 'SETTINGS_RESET'; data: SettingsData }
  | { type: 'APPLICATION_HOTKEYS'; hotkeys: SettingsData['general']['hotkeys'] }
  | SecretsOutputEvents // Forward secrets events to frontend

export const SettingsSystemEvents = fromSystem(IncomingSettingsEvents)<OutgoingSettingsEvents, typeof settings>()
type ReceivableEvents = MergeReceivable<typeof IncomingSettingsEvents, SettingsInternalEvents>;

export const settingsSystem = setup({
  types: {
    context: {} as {},
    events: {} as ReceivableEvents,
  },
  actors: {
    secretsActor
  },
  actions: {
    sendSettingsStartupData: ({ system }) => {
      const data = settingsQueries.getSettings();
      
      // Send settings to the settings plugin
      system.get(bus).send(emit(settings, { 
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
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_LOADED',
        data
      }));
    },
    
    updateSettings: ({ system, event }) => {
      const ev = typeOf('UPDATE_SETTINGS', event);
      
      // Handle special secrets operations
      if (ev.entityType === 'general' && ev.label === 'secrets' && ev.path[0] === 'secrets_operation') {
        const operation = ev.value;
        
        // Forward secrets operations to the secrets system
        if (operation.type === 'CREATE_API_KEY') {
          system.get('secrets')?.send({
            type: 'SECRETS.CMD.CREATE_API_KEY',
            provider: operation.provider,
            value: operation.value,
            customName: operation.customName
          });
        } else if (operation.type === 'UPDATE_API_KEY') {
          system.get('secrets')?.send({
            type: 'SECRETS.CMD.UPDATE_API_KEY',
            id: operation.editingSecretId,
            value: operation.value
          });
        } else if (operation.type === 'DELETE_API_KEY') {
          system.get('secrets')?.send({
            type: 'SECRETS.CMD.DELETE_API_KEY',
            id: operation.id
          });
        }
        
        // Don't process this as a normal settings update
        return;
      }
      
      // Get previous settings for comparison
      const previousSettings = ev.entityType === 'plugin' 
        ? settingsQueries.getPluginSettings(ev.label) 
        : null;
      
      settingsCommands.updateSettings(ev.entityType, ev.label, ev.path, ev.value);
      
      // Get all settings to send to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
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
    
    resetSettings: ({ system, event }) => {
      settingsCommands.resetSettings();
      
      // After reset, get the new settings to send to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_RESET',
        data
      }));
    },
    
    // Forward API key events to secrets actor
    forwardToSecrets: ({ event, system }) => {
      system.get('secrets')?.send(event);
    },
    
    // Handle events from secrets actor - sync to settings and forward to frontend
    handleSecretsEvent: ({ system, event }) => {
      // Sync secrets to secrets settings when we get loaded data
      if (event.type === 'SECRETS.EVENT.LOADED') {
        const secretsData = (event as any).data || [];
        const newSecrets: any = {
          google: null,
          anthropic: null,
          openai: null,
          groq: null,
          mistral: null,
          cohere: null,
          custom: {}
        };
        
        // Map secrets to secrets references
        for (const secret of secretsData) {
          if (secret.provider === 'custom' && secret.customName) {
            newSecrets.custom[secret.customName] = secret.id;
          } else if (secret.provider !== 'custom') {
            newSecrets[secret.provider] = secret.id;
          }
        }
        
        // Update settings
        settingsCommands.updateSettings('general', 'secrets', [], newSecrets);
        
        // Send updated settings to frontend
        const updatedSettings = settingsQueries.getSettings();
        system.get(bus).send(emit(settings, {
          type: 'SETTINGS_UPDATED',
          data: updatedSettings
        }));
      }
      
      // Forward to frontend
      system.get(bus).send(emit(settings, event as SecretsOutputEvents));
    },

    spawnSecretsActor: enqueueActions(({ enqueue }) => {
      // Spawn the secrets child actor
      enqueue.spawnChild('secretsActor', {
        systemId: 'secrets',
        input: { parentRef: settings }
      });
    })
  },
}).createMachine({
  id: settings,
  initial: 'idle',
  context: {},
  // entry: () => {
  //   // Initialize development settings if needed
  //   // setupDevelopmentSettings();
  // },
  entry: ['spawnSecretsActor'],
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
        // Forward incoming SECRETS.CMD.* events to secrets actor
        'SECRETS.CMD.*': {
          actions: 'forwardToSecrets',
        },
        // Handle outgoing SECRETS.EVENT.* events from secrets actor
        'SECRETS.EVENT.*': {
          actions: 'handleSecretsEvent',
        },
      },
    },
  },
});