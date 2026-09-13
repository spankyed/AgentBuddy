import { emit } from '@/__generated__/events';
// The application plugin belongs to the host, not this pack
import { emit as emitToPlugin } from '@abuddy/sdk/helpers';
import { createMachine, setup, sendTo, enqueueActions, fromPromise, type ErrorActorEvent } from 'xstate';
import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';

import { bus } from '@abuddy/sdk/ids';
import { threads } from '@/__generated__/system-ids';

import type { SettingsData, FAQItem } from './types';
import { loadFaqs } from './faqs';
import { settingsQueries, settingsCommands } from './repository';
import { secretsActor } from './secrets/system';
import type { SecretsOutputEvents } from './secrets/system';
import { detectAllArrayChanges } from './change-detection';
// TODO: move seedData orchestration out of settings — belongs in core API (packs system)
import { getCompiledDir, seedData, type SeedCounts, type SeedIncludeSet } from '@/__generated__/seeders';
import { previewPackSeeds, type PackSeedsPreview } from '@abuddy/sdk/seed';
import { testCli, isCliName, clearCliPathCache } from '@abuddy/sdk/utils';
import { resetLmdbFiles } from '@abuddy/host/ears';
import { createDefaultSettings } from './repository';
import { runMigrations } from '@abuddy/sdk/utils';
import { mergeSecretReferences } from './secrets/merge-secret-settings';

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
): Record<string, SeedIncludeSet | undefined> {
  const conv = (v: string[] | null): SeedIncludeSet => (v === null ? true : new Set(v));
  return {
    actions: conv(include.actions),
    prompts: conv(include.prompts),
    flows: conv(include.flows),
    library: conv(include.library),
    notes: conv(include.notes),
    settings: conv(include.settings),
  };
}

type IncomingSettingsEvents =
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; entityType: 'general' | 'plugin' | 'internal'; label: string; path: string[]; value: any }
  | { type: 'RESET_SETTINGS' }
  | { type: 'SECRETS.CMD.CREATE_API_KEY'; provider: string; value: string; customName?: string }
  | { type: 'SECRETS.CMD.UPDATE_API_KEY'; id: string; value: string }
  | { type: 'SECRETS.CMD.DELETE_API_KEY'; id: string }
  | { type: 'SECRETS.CMD.GET_API_KEYS' }
  | { type: 'TEST_CLI_PROVIDER'; provider: string }
  | { type: 'PREVIEW_PACK_SEEDS'; directory: string }
  | { type: 'IMPORT_PACK_SEEDS'; directory: string; include?: { actions: string[] | null; prompts: string[] | null; flows: string[] | null; library: string[] | null; notes: string[] | null; settings: string[] | null }; mode?: 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace'; restartBrain?: boolean }
  | { type: 'REPLACE_SETTINGS'; data: SettingsData }
  | { type: 'RESET_APP' }

type SettingsInternalEvents =
  | SecretsOutputEvents // Events from child secrets actor

export type OutgoingSettingsEvents =
  | { type: 'SETTINGS_LOADED'; data: SettingsData; faqs: FAQItem[] }
  | { type: 'SETTINGS_UPDATED'; data: SettingsData }
  | { type: 'SETTINGS_RESET'; data: SettingsData }
  | { type: 'APPLICATION_HOTKEYS'; hotkeys: SettingsData['general']['application']['hotkeys'] }
  | { type: 'CLI_TEST_RESULT'; provider: string; success: boolean; error?: string; resolvedPath?: string }
  | { type: 'PACK_SEEDS_IMPORTED'; result: Record<string, SeedCounts> }
  | { type: 'PACK_SEEDS_IMPORT_FAILED'; error: string }
  | { type: 'PACK_SEEDS_PREVIEW'; preview: PackSeedsPreview }
  | { type: 'PACK_SEEDS_PREVIEW_FAILED'; error: string }
  | { type: 'APP_RESET_COMPLETE' }
  | { type: 'APP_RESET_FAILED'; error: string }
  | SecretsOutputEvents // Forward secrets events to frontend

export const settingsSpec = defineSystem('settings')<IncomingSettingsEvents | SettingsInternalEvents, OutgoingSettingsEvents>();
export const settings = settingsSpec.id;

export const settingsSystem = setup({
  types: settingsSpec.types,
  actors: {
    secretsActor,
    resetAppActor: fromPromise(async () => {
      await resetLmdbFiles();
      createDefaultSettings();
      seedData({ compiledDir: getCompiledDir(), verbose: true });
      runMigrations();
    }),
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
      const faqs = loadFaqs();

      // Send settings to the settings plugin
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_LOADED',
        data,
        faqs
      }));
      
      // Send hotkeys to the application
      system.get(bus).send(emitToPlugin('application', {
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
      const faqs = loadFaqs();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_LOADED',
        data,
        faqs
      }));
    },
    
    handleSecretsOperation: ({ system, event }) => {
      const ev = settingsSpec.typeOf('UPDATE_SETTINGS', event);
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
      const ev = settingsSpec.typeOf('UPDATE_SETTINGS', event);
      
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
        system.get(bus).send(emitToPlugin('application', {
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
    
    replaceSettings: ({ system, event }) => {
      const ev = settingsSpec.typeOf('REPLACE_SETTINGS', event);
      settingsCommands.replaceSettings(ev.data);

      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_UPDATED',
        data
      }));

      // Re-send hotkeys in case they changed
      system.get(bus).send(emitToPlugin('application', {
        type: 'APPLICATION_HOTKEYS',
        hotkeys: data.general.application.hotkeys
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
    
    // Forward API key events to secrets actor
    forwardToSecrets: ({ event, system }) => {
      system.get('secrets')?.send(event);
    },
    
    // Handle events from secrets actor - sync to settings and forward to frontend
    handleSecretsEvent: ({ system, event }) => {
      // Sync secrets to secrets settings when we get loaded data
      if (event.type === 'SECRETS.EVENT.LOADED') {
        const secretsData = (event as any).data || [];
        const currentSecrets = settingsQueries.getGeneralSettings().secrets;
        const newSecrets = mergeSecretReferences(currentSecrets, secretsData);
        
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
    testCliProvider: ({ system, event }) => {
      const ev = settingsSpec.typeOf('TEST_CLI_PROVIDER', event);
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

      testCli(provider, storedPath).then((result: any) => {
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

    previewPackSeeds: ({ system, event }) => {
      const ev = settingsSpec.typeOf('PREVIEW_PACK_SEEDS', event);
      try {
        const preview = previewPackSeeds(ev.directory);
        system.get(bus).send(emit(settings, { type: 'PACK_SEEDS_PREVIEW', preview }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        system.get(bus).send(emit(settings, { type: 'PACK_SEEDS_PREVIEW_FAILED', error: message }));
      }
    },

    importPackSeeds: ({ system, event }) => {
      const ev = settingsSpec.typeOf('IMPORT_PACK_SEEDS', event);
      try {
        const include = ev.include ? toSeedInclude(ev.include) : undefined;
        const result = seedData({ compiledDir: ev.directory, include, mode: ev.mode, verbose: true });
        system.get(bus).send(emit(settings, { type: 'PACK_SEEDS_IMPORTED', result }));
        if (ev.restartBrain) {
          system.get('brain').send({ type: 'RESTART_BRAIN' });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        system.get(bus).send(emit(settings, { type: 'PACK_SEEDS_IMPORT_FAILED', error: message }));
      }
    },

    onResetComplete: ({ system }) => {
      system.get('brain').send({ type: 'RESTART_BRAIN' });
      system.get(bus).send(emit(settings, { type: 'APP_RESET_COMPLETE' }));
    },

    onResetFailed: ({ system, event }) => {
      const err = (event as unknown as ErrorActorEvent).error;
      const message = err instanceof Error ? err.message : String(err);
      console.error('[settings] Reset app failed:', err);
      system.get(bus).send(emit(settings, { type: 'APP_RESET_FAILED', error: message }));
    },

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
        REPLACE_SETTINGS: {
          actions: 'replaceSettings',
        },
        RESET_SETTINGS: {
          actions: 'resetSettings',
        },
        TEST_CLI_PROVIDER: {
          actions: 'testCliProvider',
        },
        PREVIEW_PACK_SEEDS: {
          actions: 'previewPackSeeds',
        },
        IMPORT_PACK_SEEDS: {
          actions: 'importPackSeeds',
        },
        RESET_APP: {
          target: 'resetting',
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
    // Serialized single-in-flight reset. Any further RESET_APP events are
    // ignored here; the frontend is about to full-reload on APP_RESET_COMPLETE.
    resetting: {
      tags: ['resetting'],
      invoke: {
        src: 'resetAppActor',
        onDone: {
          target: 'idle',
          actions: 'onResetComplete',
        },
        onError: {
          target: 'idle',
          actions: 'onResetFailed',
        },
      },
    },
  },
});

const settingsEntry: SystemEntry = { spec: settingsSpec, machine: settingsSystem };

export default settingsEntry;
