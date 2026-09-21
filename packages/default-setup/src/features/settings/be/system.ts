import { emit, actorOf } from '@/__generated__/events';
import { createMachine, setup, sendTo, enqueueActions, fromCallback, fromPromise, type ErrorActorEvent } from 'xstate';
import { addressPluginSettings, defineSystem, onPackSettingsDefaultsChanged, type SystemEntry } from '@abuddy/sdk/framework';

import { bus } from '@abuddy/sdk/ids';

import type { SettingsData } from './types';
import { loadFaqs } from './faqs';
import { settingsQueries, settingsCommands } from './repository';
import { repository } from '@/__generated__/repository';
import { detectAllArrayChanges } from '@abuddy/sdk/utils/pure';
import { seedData, type SeedCounts, type SeedIncludeSet } from '@/__generated__/seeders';
import { previewPackSeeds, type PackSeedsPreview } from '@abuddy/sdk/seed';
import { testCli, isCliName, clearCliPathCache } from '@/features/code/be/utils/resolve-cli';
import { services } from '@/__generated__/services';
import type { FAQItem } from '@/features/settings/be/types';
import type { SecretInfo, SecretsStatus } from '@abuddy/sdk/services';
import { REQUIRED_PROVIDERS } from '../constants';
import { createLogger, reportError } from '@abuddy/sdk/logger';
import { splitRef } from '@abuddy/sdk/ids';
import { PLUGIN_SETTINGS_META_KEY, pluginSettingsKey } from '../plugin-settings';

const logger = createLogger('settings');

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
  | { type: 'UPDATE_SETTINGS'; entityType: 'general' | 'plugin'; label: string; path: string[]; value: any }
  | { type: 'RESET_SETTINGS' }
  | { type: 'TEST_CLI_PROVIDER'; provider: string }
  | { type: 'PREVIEW_PACK_SEEDS'; directory: string }
  | { type: 'IMPORT_PACK_SEEDS'; directory: string; include?: Record<string, string[] | null>; mode?: 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace'; restartBrain?: boolean }
  | { type: 'REPLACE_SETTINGS'; data: SettingsData }
  | { type: 'RESET_APP' }

type SettingsInternalEvents =
  | { type: 'PACK_SETTINGS_CHANGED' } // A pack's feature settings (defaults) registered or unregistered
  | { type: 'SECRETS_CHANGED' } // The host's stored keys or their protection changed (no values)

export type OutgoingSettingsEvents =
  | { type: 'SETTINGS_LOADED'; data: SettingsData; faqs: FAQItem[] }
  | { type: 'SETTINGS_UPDATED'; data: SettingsData }
  | { type: 'SETTINGS_RESET'; data: SettingsData }
  | { type: 'APPLICATION_HOTKEYS'; hotkeys: SettingsData['general']['application']['hotkeys'] }
  | { type: 'CLI_TEST_RESULT'; provider: string; success: boolean; error?: string; resolvedPath?: string }
  /** `errors` lists the records that couldn't be seeded (`<key>: <error>`); the rest were imported */
  | { type: 'PACK_SEEDS_IMPORTED'; result: Record<string, SeedCounts>; errors: string[] }
  | { type: 'PACK_SEEDS_IMPORT_FAILED'; error: string }
  | { type: 'PACK_SEEDS_PREVIEW'; preview: PackSeedsPreview }
  | { type: 'PACK_SEEDS_PREVIEW_FAILED'; error: string }
  | { type: 'APP_RESET_COMPLETE' }
  | { type: 'APP_RESET_FAILED'; error: string }
  /** The stored API keys, without values, and how they're protected */
  | { type: 'SECRETS_UPDATED'; secrets: SecretInfo[]; status: SecretsStatus }

/** What the plugin whose settings changed receives: `<PLUGIN ID>_SETTINGS_UPDATED` (`NOTES_SETTINGS_UPDATED`) */
export type PluginSettingsUpdatedEvent = { type: `${string}_SETTINGS_UPDATED`; settings: unknown };

/**
 * Sends a plugin its updated settings. Any pack's plugin can have settings, so the receiver isn't one
 * this pack's event maps name.
 */
/** The reserved key inside `plugins` for the app's own metadata (visibility, last active) — not a plugin */

const emitPluginSettings = emit as (pluginId: string, event: PluginSettingsUpdatedEvent) => ReturnType<typeof emit>;

export const settingsSpec = defineSystem('settings')<IncomingSettingsEvents | SettingsInternalEvents, OutgoingSettingsEvents>();
export const settings = settingsSpec.id;

/** CLI path overrides, in the code plugin's settings */
const cliPaths = (): Record<string, string | undefined> =>
  (settingsQueries.getPluginSettings('code') as { cliPaths?: Record<string, string | undefined> } | null)?.cliPaths ?? {};

/** Sends the settings plugin the stored API keys (no values) and how they're protected */
function sendSecrets(system: { get(id: string): { send(event: unknown): void } | undefined }): void {
  system.get(bus)?.send(emit('settings', { type: 'SECRETS_UPDATED', secrets: services.secrets.list(), status: services.secrets.status() }));
}

export const settingsSystem = setup({
  types: settingsSpec.types,
  actors: {
    packSettingsListener: fromCallback(({ sendBack }) => onPackSettingsDefaultsChanged(() => sendBack({ type: 'PACK_SETTINGS_CHANGED' }))),
    // The host resets the whole app: stores, each pack's onInit and boot seed, migrations
    resetAppActor: fromPromise(() => services.appData.reset()),
  },
  actions: {
    sendSettingsStartupData: ({ system }) => {
      const data = settingsQueries.getSettings();
      const faqs = loadFaqs();

      // Send settings to the settings plugin
      system.get(bus).send(emit('settings', {
        type: 'SETTINGS_LOADED',
        data,
        faqs
      }));
      
      // Send hotkeys to the application
      system.get(bus).send(emit('host/application', {
        type: 'APPLICATION_HOTKEYS' as const,
        hotkeys: data.general.application.hotkeys
      }));
      
      sendSecrets(system);

      // Send last active plugin to application for restoration
      if (data.plugins?._meta?.lastActivePlugin) {
        system.get(bus).send(emit('host/application', {
          type: 'APPLICATION_RESTORE_LAST_PLUGIN',
          lastActivePluginId: data.plugins._meta.lastActivePlugin
        }));
      }
    },
    
    // A pack enabled, disabled or reloaded while the app runs changes the defaults (a plugin's visibility)
    sendPackSettingsUpdate: ({ system }) => {
      system.get(bus).send(emit('settings', { type: 'SETTINGS_UPDATED', data: settingsQueries.getSettings() }));
    },

    getSettings: ({ system, event }) => {
      const data = settingsQueries.getSettings();
      const faqs = loadFaqs();
      system.get(bus).send(emit('settings', {
        type: 'SETTINGS_LOADED',
        data,
        faqs
      }));
    },
    
    updateSettings: ({ system, event }) => {
      const ev = settingsSpec.typeOf('UPDATE_SETTINGS', event);
      // A plugin's settings are keyed by its address; the frontend resolves a name before sending
      const plugin = ev.entityType === 'plugin' && ev.label !== PLUGIN_SETTINGS_META_KEY ? splitRef(ev.label) : undefined;
      if (ev.entityType === 'plugin' && ev.label !== PLUGIN_SETTINGS_META_KEY && !plugin) {
        reportError({ error: new Error(`Settings for plugin "${ev.label}" weren't saved: a plugin's settings are keyed by its address, "<packId>/<featureId>"`), source: 'settings' });
        return;
      }

      // Get previous settings for comparison
      const previousSettings = ev.entityType === 'plugin' 
        ? settingsQueries.getPluginSettings(ev.label) 
        : null;
      
      settingsCommands.updateSettings(ev.entityType, ev.label, ev.path, ev.value);

      if (plugin && ev.label === pluginSettingsKey('code') && ev.path[0] === 'cliPaths') {
        clearCliPathCache();
      }

      // Get all settings to send to frontend
      const data = settingsQueries.getSettings();
      system.get(bus).send(emit('settings', {
        type: 'SETTINGS_UPDATED',
        data
      }));
      
      // If hotkeys were updated, send them to the application
      // Check if updating entire hotkeys object (label === 'hotkeys') or a specific property
      if (ev.entityType === 'general' && (ev.label === 'hotkeys' || ev.path[0] === 'hotkeys')) {
        system.get(bus).send(emit('host/application', {
          type: 'APPLICATION_HOTKEYS',
          hotkeys: data.general.application.hotkeys
        }));
      }
      
      // If plugin settings were updated, forward to both backend and frontend.
      //
      // `_meta` is not one of them. It is the reserved key inside `plugins` holding the app's own
      // metadata — which plugins are visible, which was last active — and `checkFeatureSettings`
      // already excludes it from the plugins a feature may set. Treating it as a plugin id sent
      // `_META_SETTINGS_UPDATED` to a plugin that does not exist, on every visibility toggle and
      // every plugin switch, which the bus dropped and reported.
      if (plugin && data.plugins) {
        const pluginSettings = data.plugins[ev.label as keyof typeof data.plugins];
        if (pluginSettings) {
          // Detect changes for all arrays in the settings generically
          const changes = detectAllArrayChanges(previousSettings, pluginSettings);
          
          // Send to backend system (if it exists)
          const backendActor = system.get(ev.label as any);
          if (backendActor) {
            const eventType = `${plugin.featureId.toUpperCase()}_SETTINGS_UPDATED`;
            backendActor.send({
              type: eventType,
              settings: pluginSettings,
              changes
            });
          }
          
          // Send settings update event to the frontend plugin
          system.get(bus).send(emitPluginSettings(ev.label, {
            type: `${plugin.featureId.toUpperCase()}_SETTINGS_UPDATED`,
            settings: pluginSettings
          }));
        }
      }
    },
    
    replaceSettings: ({ system, event }) => {
      const ev = settingsSpec.typeOf('REPLACE_SETTINGS', event);
      // Settings exported before 0.3.15 keep each plugin's slice under its feature id
      const plugins = ev.data.plugins && addressPluginSettings(ev.data.plugins).plugins;
      settingsCommands.replaceSettings(plugins ? { ...ev.data, plugins } : ev.data);

      const data = settingsQueries.getSettings();
      system.get(bus).send(emit('settings', {
        type: 'SETTINGS_UPDATED',
        data
      }));

      // Re-send hotkeys in case they changed
      system.get(bus).send(emit('host/application', {
        type: 'APPLICATION_HOTKEYS',
        hotkeys: data.general.application.hotkeys
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
    
    // The stored keys changed: refresh the plugin, and start the birth flow once a required provider has a key
    secretsChanged: ({ system }) => {
      sendSecrets(system);
      const threadsActor = actorOf(system, 'threads');
      if (!threadsActor) return;
      const hasRequiredKey = services.secrets.list().some((secret) => secret.selected && (REQUIRED_PROVIDERS as readonly string[]).includes(secret.provider));
      if (hasRequiredKey && !settingsQueries.getAssistantSettings().birthdate) {
        threadsActor.send({ type: 'BIRTH_FLOW_START' });
      }
    },

    testCliProvider: ({ system, event }) => {
      const ev = settingsSpec.typeOf('TEST_CLI_PROVIDER', event);
      const provider = ev.provider;

      if (!isCliName(provider)) {
        system.get(bus).send(emit('settings', {
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
          settingsCommands.updateSettings('plugin', pluginSettingsKey('code'), ['cliPaths'], { ...cliPaths(), [provider]: result.resolvedPath });

          const data = settingsQueries.getSettings();
          system.get(bus).send(emit('settings', { type: 'SETTINGS_UPDATED', data }));
        } else {
          logger.error(`CLI test failed for "${provider}"`, { error: result.error });
        }

        system.get(bus).send(emit('settings', {
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
        system.get(bus).send(emit('settings', { type: 'PACK_SEEDS_PREVIEW', preview }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        system.get(bus).send(emit('settings', { type: 'PACK_SEEDS_PREVIEW_FAILED', error: message }));
      }
    },

    importPackSeeds: ({ system, event }) => {
      const ev = settingsSpec.typeOf('IMPORT_PACK_SEEDS', event);
      try {
        const include = ev.include ? toSeedInclude(ev.include) : undefined;
        // Read first: a directory that can't name its pack fails before anything is imported
        const { packId } = previewPackSeeds(ev.directory);
        const result = seedData({ compiledDir: ev.directory, include, mode: ev.mode, verbose: true });
        // Seeders report records they couldn't seed in their counts rather than throwing
        const errors = Object.entries(result).flatMap(([key, counts]) => (counts.errors ?? []).map((error) => `${key}: ${error}`));
        system.get(bus).send(emit('settings', { type: 'PACK_SEEDS_IMPORTED', result, errors }));
        // The running systems read what the seeds changed (the chat's slash commands, the library's documents)
        system.get(bus).send({ type: 'PACK_CHANGED', packId });
        if (ev.restartBrain) {
          actorOf(system, 'brain').send({ type: 'RESTART_BRAIN' });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        system.get(bus).send(emit('settings', { type: 'PACK_SEEDS_IMPORT_FAILED', error: message }));
      }
    },

    onResetComplete: ({ system }) => {
      actorOf(system, 'brain').send({ type: 'RESTART_BRAIN' });
      actorOf(system, 'threads')?.send({ type: 'COMMANDS_CHANGED' });
      system.get(bus).send(emit('settings', { type: 'APP_RESET_COMPLETE' }));
    },

    onResetFailed: ({ system, event }) => {
      const err = (event as unknown as ErrorActorEvent).error;
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Reset app failed', { error: err });
      system.get(bus).send(emit('settings', { type: 'APP_RESET_FAILED', error: message }));
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

const settingsEntry = { spec: settingsSpec, machine: settingsSystem } satisfies SystemEntry;

export default settingsEntry;
