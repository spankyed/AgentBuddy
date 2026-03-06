import { createMachine, setup, sendTo, enqueueActions } from 'xstate';
import type { MergeReceivable } from '@/core/helpers/event-helpers';
import { fromSystem, systemBus } from '@/core/helpers/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, safeEvents } from '@/core/helpers/actor-helpers';
import { SettingsData } from './types';
import { settingsQueries, settingsCommands } from './repository';
import { secretsActor } from './secrets/system';
import type { SecretsOutputEvents } from './secrets/system';
import { detectAllArrayChanges } from './change-detection';
import { z } from 'zod';
import { agent } from '@/systems/agent/system';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const CLI_TEST_COMMANDS: Record<string, { command: string; args: string[] }> = {
  copilot:       { command: 'copilot', args: ['--version'] },
  'claude-code': { command: 'claude', args: ['--version'] },
  codex:         { command: 'codex', args: ['--version'] },
};

const typeOf = safeEvents<ReceivableEvents>();

export const settings = 'settings' as const;

const busEvent = systemBus(settings);

export const IncomingSettingsEvents = [
  busEvent('GET_SETTINGS', {}),
  busEvent('UPDATE_SETTINGS', {
    entityType: z.enum(['general', 'plugin', 'internal']),
    label: z.string(),
    path: z.array(z.string()),
    value: z.any()
  }),
  busEvent('RESET_SETTINGS', {}),
  busEvent('COMPLETE_ONBOARDING', {}),
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
  busEvent('TEST_CLI_PROVIDER', {
    provider: z.string(),
  }),
] as const

export type SettingsInternalEvents = 
  | SystemEvents
  | SecretsOutputEvents // Events from child secrets actor

export type OutgoingSettingsEvents =
  | { type: 'SETTINGS_LOADED'; data: SettingsData }
  | { type: 'SETTINGS_UPDATED'; data: SettingsData }
  | { type: 'SETTINGS_RESET'; data: SettingsData }
  | { type: 'APPLICATION_HOTKEYS'; hotkeys: SettingsData['general']['hotkeys'] }
  | { type: 'CLI_TEST_RESULT'; provider: string; success: boolean; error?: string }
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
  guards: {
    isSecretsOperation: ({ event }) => {
      const ev = event as any;
      return ev.entityType === 'general' && 
             ev.label === 'secrets' && 
             ev.path?.[0] === 'secrets_operation';
    }
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
      
      // Send last active plugin to application for restoration
      if (data.plugins?._meta?.lastActivePlugin) {
        system.get(bus).send({
          type: 'OUTGOING',
          event: {
            type: 'APPLICATION_RESTORE_LAST_PLUGIN',
            pluginId: 'application',
            lastActivePluginId: data.plugins._meta.lastActivePlugin
          }
        });
      }
    },
    
    getSettings: ({ system, event }) => {
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_LOADED',
        data
      }));
    },
    
    handleSecretsOperation: ({ system, event }) => {
      const ev = typeOf('UPDATE_SETTINGS', event);
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

        // Check if we should trigger birth flow
        const assistantSettings = settingsQueries.getAssistantSettings();

        // Check if we have required API keys now
        const hasRequiredKeys = (secretsData: any[]): boolean => {
          const requiredProviders = updatedSettings.general.secrets.required || ['openai', 'anthropic'];
          return requiredProviders.some((provider: string) =>
            secretsData.some((secret: any) => secret.provider === provider)
          );
        };

        // Notify agent system about API key changes
        const agentActor = system.get(agent);
        if (agentActor) {
          agentActor.send({ type: 'API_KEYS_CHANGED' });

          // If we now have required API keys and no birth has occurred, trigger birth flow
          if (!assistantSettings.birthdate && hasRequiredKeys(secretsData)) {
            agentActor.send({ type: 'BIRTH_FLOW_START' });
          }
        }
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
    }),
    completeTour: () => {
      // Check if tourStarted is true and reset it
      const internalSettings = settingsQueries.getInternalSettings();
      if (internalSettings.tourStarted) {
        // Reset tourStarted to false
        settingsCommands.updateSettings('internal', null, ['tourStarted'], false);

        // Show all plugins
        const allPlugins = ['threads', 'agent', 'code', 'library', 'actions', 'prompts', 'flows', 'brain', 'database', 'logs', 'blank'];
        const visibilityUpdate: Record<string, boolean> = {};
        allPlugins.forEach(plugin => {
          visibilityUpdate[plugin] = true;
        });
        visibilityUpdate['settings'] = true; // Settings should always be visible

        settingsCommands.updateSettings('plugin', '_meta', ['visibility'], visibilityUpdate);
      }
    },
    
    testCliProvider: ({ system, event }) => {
      const ev = typeOf('TEST_CLI_PROVIDER', event);
      const provider = ev.provider;
      const cmd = CLI_TEST_COMMANDS[provider];

      if (!cmd) {
        system.get(bus).send(emit(settings, {
          type: 'CLI_TEST_RESULT',
          provider,
          success: false,
          error: `Unknown CLI provider: ${provider}`,
        }));
        return;
      }

      const data = settingsQueries.getSettings();
      const storedPath = data.general.secrets.cliPaths?.[provider];
      const command = storedPath || cmd.command;

      execFileAsync(command, cmd.args, { timeout: 10000 })
        .then(() => {
          system.get(bus).send(emit(settings, {
            type: 'CLI_TEST_RESULT',
            provider,
            success: true,
          }));
        })
        .catch((err: any) => {
          console.error(`[settings] CLI test failed for "${provider}":`, err.message || err);
          system.get(bus).send(emit(settings, {
            type: 'CLI_TEST_RESULT',
            provider,
            success: false,
            error: err.message || 'Command failed',
          }));
        });
    },

    completeOnboarding: ({ system }) => {
      settingsCommands.updateSettings('internal', null, ['tourComplete'], true);
      settingsCommands.updateSettings('internal', null, ['tourStarted'], false);

      const allPlugins = ['threads', 'agent', 'code', 'library', 'actions', 'prompts', 'flows', 'brain', 'database', 'logs', 'blank', 'settings'];
      const visibilityUpdate: Record<string, boolean> = {};
      allPlugins.forEach(plugin => {
        visibilityUpdate[plugin] = true;
      });

      settingsCommands.updateSettings('plugin', '_meta', ['visibility'], visibilityUpdate);

      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_UPDATED',
        data
      }));

      // Trigger the onboarding flow via agent → brain
      const agentActor = system.get(agent);
      if (agentActor) {
        agentActor.send({ type: 'BIRTH_FLOW_START' });
      }
    }
  },
}).createMachine({
  id: settings,
  initial: 'idle',
  context: {},
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
        UPDATE_SETTINGS: [
          {
            guard: 'isSecretsOperation',
            actions: 'handleSecretsOperation',
          },
          {
            actions: 'updateSettings',
          }
        ],
        RESET_SETTINGS: {
          actions: 'resetSettings',
        },
        COMPLETE_ONBOARDING: {
          actions: 'completeOnboarding',
        },
        TEST_CLI_PROVIDER: {
          actions: 'testCliProvider',
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