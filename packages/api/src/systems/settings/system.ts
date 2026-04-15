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
import { threads } from '@/systems/threads/system';
import * as path from 'path';
import { seedData, type SeedResult, type SeedInclude } from '@/setup/seed/index';
import { previewSetupPack as readSetupPackPreview, type SetupPackPreview } from '@/setup/seed/preview';
import { testCli, isCliName, clearCliPathCache } from '@/core/helpers/resolve-cli';
import { resetLmdbFiles } from '@/core/ears/attribute-storage';
import { createDefaultSettings } from './repository';
import { runMigrations } from '@/setup/migrations';

const typeOf = safeEvents<ReceivableEvents>();

export const settings = 'settings' as const;

/**
 * Convert the JSON-safe include shape from the frontend
 * (`null = all items, [] = skip, string[] = filter`) into the `SeedInclude`
 * structure consumed by `seedData`.
 */
function toSeedInclude(
  include: {
    actions: string[] | null;
    prompts: string[] | null;
    flows: string[] | null;
    library: string[] | null;
    notes: string[] | null;
    settings: string[] | null;
  },
): SeedInclude {
  const conv = (v: string[] | null) => (v === null ? true : new Set(v));
  return {
    actions: conv(include.actions),
    prompts: conv(include.prompts),
    flows: conv(include.flows),
    library: conv(include.library),
    notes: conv(include.notes),
    settings: conv(include.settings),
  };
}

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
  busEvent('PREVIEW_SETUP_PACK', {
    directory: z.string(),
  }),
  busEvent('IMPORT_SETUP_PACK', {
    directory: z.string(),
    include: z.object({
      actions: z.array(z.string()).nullable(),
      prompts: z.array(z.string()).nullable(),
      flows: z.array(z.string()).nullable(),
      library: z.array(z.string()).nullable(),
      notes: z.array(z.string()).nullable(),
      settings: z.array(z.string()).nullable(),
    }).optional(),
    mode: z.enum(['keep-existing', 'replace-on-collision', 'wipe-and-replace']).optional(),
    restartBrain: z.boolean().optional(),
  }),
  busEvent('RESET_APP', {}),
] as const

export type SettingsInternalEvents = 
  | SystemEvents
  | SecretsOutputEvents // Events from child secrets actor

export type OutgoingSettingsEvents =
  | { type: 'SETTINGS_LOADED'; data: SettingsData }
  | { type: 'SETTINGS_UPDATED'; data: SettingsData }
  | { type: 'SETTINGS_RESET'; data: SettingsData }
  | { type: 'APPLICATION_HOTKEYS'; hotkeys: SettingsData['general']['application']['hotkeys'] }
  | { type: 'CLI_TEST_RESULT'; provider: string; success: boolean; error?: string; resolvedPath?: string }
  | { type: 'SETUP_PACK_IMPORTED'; result: SeedResult }
  | { type: 'SETUP_PACK_IMPORT_FAILED'; error: string }
  | { type: 'SETUP_PACK_PREVIEW'; preview: SetupPackPreview }
  | { type: 'SETUP_PACK_PREVIEW_FAILED'; error: string }
  | { type: 'APP_RESET_COMPLETE' }
  | { type: 'APP_RESET_FAILED'; error: string }
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
        hotkeys: data.general.application.hotkeys
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

      if (ev.entityType === 'general' && ev.label === 'secrets' && ev.path[0] === 'cliPaths') {
        clearCliPathCache();
      }

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
          hotkeys: data.general.application.hotkeys
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

        // Notify threads system about API key changes
        const threadsActor = system.get(threads);
        if (threadsActor) {
          threadsActor.send({ type: 'API_KEYS_CHANGED' });

          // If we now have required API keys and no birth has occurred, trigger birth flow
          if (!assistantSettings.birthdate && hasRequiredKeys(secretsData)) {
            threadsActor.send({ type: 'BIRTH_FLOW_START' });
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
      // Show all plugins when tour completes
      const allPlugins = ['threads', 'code', 'library', 'actions', 'prompts', 'flows', 'brain', 'database', 'logs', 'blank', 'settings'];
      const visibilityUpdate: Record<string, boolean> = {};
      allPlugins.forEach(plugin => {
        visibilityUpdate[plugin] = true;
      });

      settingsCommands.updateSettings('plugin', '_meta', ['visibility'], visibilityUpdate);
    },

    testCliProvider: ({ system, event }) => {
      const ev = typeOf('TEST_CLI_PROVIDER', event);
      const provider = ev.provider;

      if (!isCliName(provider)) {
        system.get(bus).send(emit(settings, {
          type: 'CLI_TEST_RESULT',
          provider,
          success: false,
          error: `Unknown CLI provider: ${provider}`,
        }));
        return;
      }

      const storedPath = settingsQueries.getSettings().general.secrets.cliPaths?.[provider];

      testCli(provider, storedPath).then((result) => {
        if (result.success) {
          const currentPaths = settingsQueries.getSettings().general.secrets.cliPaths;
          settingsCommands.updateSettings('general', 'secrets', ['cliPaths'], { ...currentPaths, [provider]: result.resolvedPath });

          const data = settingsQueries.getSettings();
          system.get(bus).send(emit(settings, { type: 'SETTINGS_UPDATED', data }));
        } else {
          console.error(`[settings] CLI test failed for "${provider}":`, result.error);
        }

        system.get(bus).send(emit(settings, {
          type: 'CLI_TEST_RESULT',
          provider,
          ...result,
        }));
      });
    },

    previewSetupPack: ({ system, event }) => {
      const ev = typeOf('PREVIEW_SETUP_PACK', event);
      try {
        const preview = readSetupPackPreview(ev.directory);
        system.get(bus).send(emit(settings, { type: 'SETUP_PACK_PREVIEW', preview }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        system.get(bus).send(emit(settings, { type: 'SETUP_PACK_PREVIEW_FAILED', error: message }));
      }
    },

    importSetupPack: ({ system, event }) => {
      const ev = typeOf('IMPORT_SETUP_PACK', event);
      try {
        const include = ev.include ? toSeedInclude(ev.include) : undefined;
        const result = seedData({ compiledDir: ev.directory, include, mode: ev.mode, verbose: true });
        system.get(bus).send(emit(settings, { type: 'SETUP_PACK_IMPORTED', result }));
        if (ev.restartBrain) {
          system.get('brain').send({ type: 'RESTART_BRAIN' });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        system.get(bus).send(emit(settings, { type: 'SETUP_PACK_IMPORT_FAILED', error: message }));
      }
    },

    resetApp: ({ system }) => {
      const DEFAULT_DIR = path.resolve(process.cwd(), '..', 'default-setup', 'dist');
      resetLmdbFiles().then(() => {
        createDefaultSettings();
        seedData({ compiledDir: DEFAULT_DIR, verbose: true });
        runMigrations();
        system.get('brain').send({ type: 'RESTART_BRAIN' });
        system.get(bus).send(emit(settings, { type: 'APP_RESET_COMPLETE' }));
      }).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[settings] Reset app failed:', err);
        system.get(bus).send(emit(settings, { type: 'APP_RESET_FAILED', error: message }));
      });
    },

    completeOnboarding: ({ system }) => {
      settingsCommands.updateSettings('internal', null, ['tourComplete'], true);

      const allPlugins = ['threads', 'code', 'library', 'actions', 'prompts', 'flows', 'brain', 'database', 'logs', 'blank', 'settings'];
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

      // Trigger the onboarding flow via threads → brain
      const threadsActor = system.get(threads);
      if (threadsActor) {
        threadsActor.send({ type: 'BIRTH_FLOW_START' });
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
        PREVIEW_SETUP_PACK: {
          actions: 'previewSetupPack',
        },
        IMPORT_SETUP_PACK: {
          actions: 'importSetupPack',
        },
        RESET_APP: {
          actions: 'resetApp',
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