import { emit } from '@/__generated__/events';
import { createMachine, setup, sendTo, enqueueActions, fromCallback, fromPromise, type ErrorActorEvent } from 'xstate';
import { defineSystem, onPackSettingsDefaultsChanged, type SystemEntry } from '@abuddy/sdk/framework';

import { bus } from '@abuddy/sdk/ids';
import { threads } from '@/__generated__/system-ids';

import type { SettingsData } from './types';
import { loadFaqs } from './faqs';
import { settingsQueries, settingsCommands } from './repository';
import { detectAllArrayChanges } from '@abuddy/sdk/utils/pure';
// TODO: move seedData orchestration out of settings — belongs in core API (packs system)
import { getCompiledDir, seedData, type SeedCounts, type SeedIncludeSet } from '@/__generated__/seeders';
import { previewPackSeeds, type PackSeedsPreview } from '@abuddy/sdk/seed';
import { testCli, isCliName, clearCliPathCache } from '@abuddy/sdk/utils';
import { services } from '@/__generated__/services';
import { createDefaultSettings } from './repository';
import { runMigrations } from '@abuddy/sdk/utils';
import type { FAQItem } from '@/features/settings/be/types';
import type { SecretInfo, SecretsStatus } from '@abuddy/sdk/services';
import { REQUIRED_PROVIDERS } from '../constants';

/**
 * Convert the JSON-safe include shape from the frontend
 * (`null = all items, [] = skip, string[] = filter`) into the `SeedInclude`
 * structure consumed by `seedData`.
 */
function toSeedInclude(include: Record<string, string[] | null>): Record<string, SeedIncludeSet | undefined> {
  return Object.fromEntries(Object.entries(include).map(([key, items]) => [key, items === null ? true : new Set(items)]));
}

type IncomingSettingsEvents =
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; entityType: 'general' | 'plugin' | 'internal'; label: string; path: string[]; value: any }
  | { type: 'RESET_SETTINGS' }
  | { type: 'TEST_CLI_PROVIDER'; provider: string }
  | { type: 'PREVIEW_PACK_SEEDS'; directory: string }
  | { type: 'IMPORT_PACK_SEEDS'; directory: string; include?: Record<string, string[] | null>; mode?: 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace'; restartBrain?: boolean }
  | { type: 'REPLACE_SETTINGS'; data: SettingsData }
  | { type: 'RESET_APP' }

type SettingsInternalEvents =
  | { type: 'PACK_SETTINGS_CHANGED' } // A pack's feature settings (defaults) registered or unregistered
  | { type: 'SECRETS_CHANGED' } // The host's secrets procedures changed the stored keys (no values)

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
  /** The stored API keys, without values, and how they're protected */
  | { type: 'SECRETS_UPDATED'; secrets: SecretInfo[]; status: SecretsStatus }

export const settingsSpec = defineSystem('settings')<IncomingSettingsEvents | SettingsInternalEvents, OutgoingSettingsEvents>();
export const settings = settingsSpec.id;

/** CLI path overrides, in the code plugin's settings */
const cliPaths = (): Record<string, string | undefined> =>
  (settingsQueries.getPluginSettings('code') as { cliPaths?: Record<string, string | undefined> } | null)?.cliPaths ?? {};

/** Sends the settings plugin the stored API keys (no values) and how they're protected */
function sendSecrets(system: { get(id: string): { send(event: unknown): void } | undefined }): void {
  system.get(bus)?.send(emit(settings, { type: 'SECRETS_UPDATED', secrets: services.secrets.list(), status: services.secrets.status() }));
}

export const settingsSystem = setup({
  types: settingsSpec.types,
  actors: {
    packSettingsListener: fromCallback(({ sendBack }) => onPackSettingsDefaultsChanged(() => sendBack({ type: 'PACK_SETTINGS_CHANGED' }))),
    resetAppActor: fromPromise(async () => {
      await services.appData.reset();
      createDefaultSettings();
      seedData({ compiledDir: getCompiledDir(), verbose: true });
      runMigrations();
    }),
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
      system.get(bus).send(emit('application', {
        type: 'APPLICATION_HOTKEYS' as const,
        hotkeys: data.general.application.hotkeys
      }));
      
      sendSecrets(system);

      // Send last active plugin to application for restoration
      if (data.plugins?._meta?.lastActivePlugin) {
        system.get(bus).send(emit('application', {
          type: 'APPLICATION_RESTORE_LAST_PLUGIN',
          lastActivePluginId: data.plugins._meta.lastActivePlugin
        }));
      }
    },
    
    // A pack enabled, disabled or reloaded while the app runs changes the defaults (a plugin's visibility)
    sendPackSettingsUpdate: ({ system }) => {
      system.get(bus).send(emit(settings, { type: 'SETTINGS_UPDATED', data: settingsQueries.getSettings() }));
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
    
    updateSettings: ({ system, event }) => {
      const ev = settingsSpec.typeOf('UPDATE_SETTINGS', event);
      
      // Get previous settings for comparison
      const previousSettings = ev.entityType === 'plugin' 
        ? settingsQueries.getPluginSettings(ev.label) 
        : null;
      
      settingsCommands.updateSettings(ev.entityType, ev.label, ev.path, ev.value);

      if (ev.entityType === 'plugin' && ev.label === 'code' && ev.path[0] === 'cliPaths') {
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
    
    replaceSettings: ({ system, event }) => {
      const ev = settingsSpec.typeOf('REPLACE_SETTINGS', event);
      settingsCommands.replaceSettings(ev.data);

      const data = settingsQueries.getSettings();
      system.get(bus).send(emit(settings, {
        type: 'SETTINGS_UPDATED',
        data
      }));

      // Re-send hotkeys in case they changed
      system.get(bus).send(emit('application', {
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
    
    // The stored keys changed: refresh the plugin, tell threads, and start the birth flow once a required provider has a key
    secretsChanged: ({ system }) => {
      sendSecrets(system);
      const threadsActor = system.get(threads);
      if (!threadsActor) return;
      threadsActor.send({ type: 'API_KEYS_CHANGED' });
      const hasRequiredKey = services.secrets.list().some((secret) => secret.selected && (REQUIRED_PROVIDERS as readonly string[]).includes(secret.provider));
      if (!settingsQueries.getAssistantSettings().birthdate && hasRequiredKey) {
        threadsActor.send({ type: 'BIRTH_FLOW_START' });
      }
    },

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

      const storedPath = cliPaths()[provider];

      testCli(provider, storedPath).then((result: any) => {
        if (result.success) {
          settingsCommands.updateSettings('plugin', 'code', ['cliPaths'], { ...cliPaths(), [provider]: result.resolvedPath });

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
  invoke: { src: 'packSettingsListener' },
  on: {
    PACK_SETTINGS_CHANGED: { actions: 'sendPackSettingsUpdate' },
    SECRETS_CHANGED: { actions: 'secretsChanged' },
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
