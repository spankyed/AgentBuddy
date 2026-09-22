import { sendToSystem, sendToPlugin } from '@/__generated__/events';
import { assign, createMachine, setup, sendTo, enqueueActions, fromCallback, fromPromise, type ErrorActorEvent } from 'xstate';
import { defineSystem, onPackSettingsDefaultsChanged, type SystemEntry } from '@abuddy/sdk/framework';


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
import { resolveName, splitRef } from '@abuddy/sdk/ids';
import { ref } from '@/__generated__/ref';

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

/** Each plugin's settings as they apply: what features were last told */
const appliedPluginSettings = (): Record<string, unknown> => ({ ...settingsQueries.getSettings().plugins });

/** What each feature was last told of its settings, by plugin ref */
type SettingsContext = { applied: Record<string, unknown> };

export const settingsSpec = defineSystem<IncomingSettingsEvents | SettingsInternalEvents, OutgoingSettingsEvents, SettingsContext>();

/**
 * Sends the settings plugin all the settings, as `type` (on first load with the FAQs), and the app shell the hotkeys
 * in them: whatever changed the settings, both views follow.
 */
function broadcastSettings(type: 'SETTINGS_LOADED' | 'SETTINGS_UPDATED' | 'SETTINGS_RESET'): void {
  const data = settingsQueries.getSettings();
  if (type === 'SETTINGS_LOADED') sendToPlugin('settings', { type, data, faqs: loadFaqs() });
  else sendToPlugin('settings', { type, data });
  sendToPlugin('host/application', { type: 'APPLICATION_HOTKEYS', hotkeys: data.general.application.hotkeys });
}

/** CLI path overrides, in the code plugin's settings */
const cliPaths = (): Record<string, string | undefined> =>
  (settingsQueries.getPluginSettings(ref('code')) as { cliPaths?: Record<string, string | undefined> } | null)?.cliPaths ?? {};

/** Sends the settings plugin the stored API keys (no values) and how they're protected */
function sendSecrets(): void {
  sendToPlugin('settings', { type: 'SECRETS_UPDATED', secrets: services.secrets.list(), status: services.secrets.status() });
}

export const settingsSystem = setup({
  types: settingsSpec.types,
  actors: {
    packSettingsListener: fromCallback(({ sendBack }) => onPackSettingsDefaultsChanged(() => sendBack({ type: 'PACK_SETTINGS_CHANGED' }))),
    // The host resets the whole app: stores, each pack's onInit and boot seed, migrations
    resetAppActor: fromPromise(() => services.appData.reset()),
  },
  actions: {
    sendSettingsStartupData: () => {
      broadcastSettings('SETTINGS_LOADED');
      sendSecrets();
    },
    
    rememberAppliedSettings: assign({ applied: () => appliedPluginSettings() }),

    /**
     * Tells each feature whose settings now differ from what it was last told, whatever changed them: a setting, the
     * settings replaced or reset, a pack's defaults coming or going, its keys moved when it registered
     */
    tellChangedFeatures: assign({
      applied: ({ context }) => {
        const now = appliedPluginSettings();
        for (const feature of new Set([...Object.keys(context.applied), ...Object.keys(now)])) {
          const [before, after] = [context.applied[feature], now[feature]];
          if (!splitRef(feature) || JSON.stringify(before) === JSON.stringify(after)) continue;
          // Any pack's feature has settings: its system gets the changes too, and one it doesn't run is nobody's
          const settings = after ?? {};
          const to = resolveName(feature);
          sendToSystem(to, { type: 'FEATURE_SETTINGS_UPDATED', settings, changes: detectAllArrayChanges(before ?? {}, settings) });
          sendToPlugin(to, { type: 'FEATURE_SETTINGS_UPDATED', settings });
        }
        return now;
      },
    }),

    // The settings plugin's view of all the settings, after a change it didn't make itself
    sendSettingsUpdate: () => broadcastSettings('SETTINGS_UPDATED'),

    getSettings: () => broadcastSettings('SETTINGS_LOADED'),
    
    updateSettings: ({ event }) => {
      const ev = settingsSpec.typeOf('UPDATE_SETTINGS', event);
      // A plugin's settings are keyed by its ref, which the frontend resolves before sending and the store checks
      try {
        if (ev.entityType === 'plugin') settingsCommands.updateSettings('plugin', ev.label as `${string}/${string}`, ev.path, ev.value);
        else settingsCommands.updateSettings('general', ev.label, ev.path, ev.value);
      } catch (error) {
        reportError({ error: new Error(`Settings for ${ev.entityType} "${ev.label}" weren't saved: ${(error as Error).message}`), source: 'settings' });
        return;
      }

      if (ev.entityType === 'plugin' && ev.label === ref('code') && ev.path[0] === 'cliPaths') {
        clearCliPathCache();
      }

      broadcastSettings('SETTINGS_UPDATED');
    },

    replaceSettings: ({ event }) => {
      const ev = settingsSpec.typeOf('REPLACE_SETTINGS', event);
      settingsCommands.replaceSettings(ev.data);
      broadcastSettings('SETTINGS_UPDATED');
    },

    resetSettings: () => {
      settingsCommands.resetSettings();
      broadcastSettings('SETTINGS_RESET');
    },
    
    // The stored keys changed: refresh the plugin, and start the birth flow once a required provider has a key
    secretsChanged: () => {
      sendSecrets();
      const hasRequiredKey = services.secrets.list().some((secret) => secret.selected && (REQUIRED_PROVIDERS as readonly string[]).includes(secret.provider));
      if (hasRequiredKey && !settingsQueries.getAssistantSettings().birthdate) {
        sendToSystem('threads', { type: 'BIRTH_FLOW_START' });
      }
    },

    testCliProvider: ({ event }) => {
      const ev = settingsSpec.typeOf('TEST_CLI_PROVIDER', event);
      const provider = ev.provider;

      if (!isCliName(provider)) {
        sendToPlugin('settings', {
          type: 'CLI_TEST_RESULT',
          provider,
          success: false,
          error: `Unknown CLI provider: ${provider}`,
        });
        return;
      }

      const storedPath = cliPaths()[provider];

      testCli(provider, storedPath).then((result: any) => {
        if (result.success) {
          settingsCommands.updateSettings('plugin', ref('code'), ['cliPaths'], { ...cliPaths(), [provider]: result.resolvedPath });
          broadcastSettings('SETTINGS_UPDATED');
        } else {
          logger.error(`CLI test failed for "${provider}"`, { error: result.error });
        }

        sendToPlugin('settings', {
          type: 'CLI_TEST_RESULT',
          provider,
          ...result,
        });
      });
    },

    previewPackSeeds: ({ event }) => {
      const ev = settingsSpec.typeOf('PREVIEW_PACK_SEEDS', event);
      try {
        const preview = previewPackSeeds(ev.directory);
        sendToPlugin('settings', { type: 'PACK_SEEDS_PREVIEW', preview });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendToPlugin('settings', { type: 'PACK_SEEDS_PREVIEW_FAILED', error: message });
      }
    },

    importPackSeeds: ({ event }) => {
      const ev = settingsSpec.typeOf('IMPORT_PACK_SEEDS', event);
      try {
        const include = ev.include ? toSeedInclude(ev.include) : undefined;
        // Read first: a directory that can't name its pack fails before anything is imported
        const { packId } = previewPackSeeds(ev.directory);
        const result = seedData({ compiledDir: ev.directory, include, mode: ev.mode, verbose: true });
        // Seeders report records they couldn't seed in their counts rather than throwing
        const errors = Object.entries(result).flatMap(([key, counts]) => (counts.errors ?? []).map((error) => `${key}: ${error}`));
        sendToPlugin('settings', { type: 'PACK_SEEDS_IMPORTED', result, errors });
        // The running systems read what the seeds changed (the chat's slash commands, the library's documents)
        sendToSystem('host/bus', { type: 'PACK_CHANGED', packId });
        if (ev.restartBrain) {
          sendToSystem('brain', { type: 'RESTART_BRAIN' });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendToPlugin('settings', { type: 'PACK_SEEDS_IMPORT_FAILED', error: message });
      }
    },

    onResetComplete: () => {
      sendToSystem('brain', { type: 'RESTART_BRAIN' });
      sendToSystem('threads', { type: 'COMMANDS_CHANGED' });
      sendToPlugin('settings', { type: 'APP_RESET_COMPLETE' });
    },

    onResetFailed: ({ event }) => {
      const err = (event as unknown as ErrorActorEvent).error;
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Reset app failed', { error: err });
      sendToPlugin('settings', { type: 'APP_RESET_FAILED', error: message });
    },

  },
}).createMachine({
  id: 'settings',
  initial: 'idle',
  context: { applied: {} },
  entry: 'rememberAppliedSettings',
  invoke: { src: 'packSettingsListener' },
  on: {
    // A pack registered or left: its defaults came or went, and the host may have moved its keys
    PACK_SETTINGS_CHANGED: { actions: ['sendSettingsUpdate', 'tellChangedFeatures'] },
    PACK_CHANGED: { actions: ['sendSettingsUpdate', 'tellChangedFeatures'] },
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
          actions: ['updateSettings', 'tellChangedFeatures'],
        },
        REPLACE_SETTINGS: {
          actions: ['replaceSettings', 'tellChangedFeatures'],
        },
        RESET_SETTINGS: {
          actions: ['resetSettings', 'tellChangedFeatures'],
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
