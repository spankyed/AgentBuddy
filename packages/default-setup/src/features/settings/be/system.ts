import { sendToSystem, sendToPlugin } from '@/__generated__/events';
import { assign, createMachine, setup, sendTo, enqueueActions, fromCallback, fromPromise, type ErrorActorEvent } from 'xstate';
import { defineSystem, onPackSettingsDefaultsChanged, type SystemEntry } from '@abuddy/sdk/framework';


import type { SettingsData } from './types';
import { loadFaqs } from './faqs';
import { onSettingsChange, settingsQueries, settingsCommands } from './repository';
import { SettingsRefusedError } from '../document';
import { repository } from '@/__generated__/repository';
import { detectAllArrayChanges, errorMessage } from '@abuddy/sdk/utils/pure';
import { seedData, type SeedCounts, type SeedIncludeSet } from '@/__generated__/seeders';
import { previewPackSeeds, type PackSeedsPreview } from '@abuddy/sdk/seed';
import { testCli, isCliName, clearCliPathCache } from '@/features/code/be/utils/resolve-cli';
import { services } from '@/__generated__/services';
import type { FAQItem } from '@/features/settings/be/types';
import type { SecretInfo, SecretsStatus } from '@abuddy/sdk/services';
import { REQUIRED_PROVIDERS } from '../constants';
import { createLogger, reportError } from '@abuddy/sdk/logger';
import { splitRef, type FeatureRef } from '@abuddy/sdk/ids';
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
  | { type: 'REPLACE_SETTINGS'; data: unknown }
  | { type: 'RESET_APP' }

type SettingsInternalEvents =
  | { type: 'PACK_SETTINGS_CHANGED' } // A pack's feature settings (defaults) registered or unregistered
  | { type: 'SECRETS_CHANGED' } // The host's stored keys or their protection changed (no values)
  | { type: 'SETTINGS_WRITTEN' } // Something wrote the stored settings: this system, a feature's system, an action or a seed
  // The stored data is being replaced wholesale (a backup import), and has been: what each feature was told is then
  // stale either way, since a failed import may have migrated some of the data already
  | { type: 'DATA_REPLACING' }
  | { type: 'DATA_REPLACED' }

export type OutgoingSettingsEvents =
  | { type: 'SETTINGS_LOADED'; data: SettingsData; faqs: FAQItem[] }
  | { type: 'SETTINGS_UPDATED'; data: SettingsData }
  /** A change (`UPDATE_SETTINGS`, `REPLACE_SETTINGS`) was stored */
  | { type: 'SETTINGS_SAVED' }
  /** A change was refused, and stored nothing */
  | { type: 'SETTINGS_REFUSED'; problems: string[] }
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

/**
 * Tells the settings plugin a change wasn't stored, with the store's reasons: a refusal is the user's to fix, not a
 * system error, so only what the store didn't refuse (a bug here) is reported as one
 */
function refuseSettings(error: unknown, what: string): void {
  if (!(error instanceof SettingsRefusedError)) reportError({ error: new Error(`${what}: ${(error as Error).message}`), source: 'settings' });
  sendToPlugin('settings', { type: 'SETTINGS_REFUSED', problems: error instanceof SettingsRefusedError ? error.problems : [(error as Error).message] });
}

/** Each plugin's settings as they apply: what features were last told */
const appliedPluginSettings = (): Record<string, unknown> => ({ ...settingsQueries.getSettings().plugins });

/** What each feature was last told of its settings, by plugin ref */
type SettingsContext = { applied: Record<string, unknown> };

/**
 * What the settings system takes while the stored data is being replaced or reset. A read is served, since it only
 * reports what is stored; a write is refused with `reason`, because storing it would either be lost with the data or
 * be taken for a change the user made. A settings form waits for the store's answer before it says "Saved", and the
 * settings page for a read before it renders, so dropping either leaves the user waiting for good.
 */
const whileBusy = (reason: string) => ({
  CLIENT_CONNECTED: { actions: 'sendSettingsStartupData' as const },
  GET_SETTINGS: { actions: 'getSettings' as const },
  UPDATE_SETTINGS: { actions: { type: 'refuseChange' as const, params: { reason } } },
  REPLACE_SETTINGS: { actions: { type: 'refuseChange' as const, params: { reason } } },
  RESET_SETTINGS: { actions: { type: 'refuseChange' as const, params: { reason } } },
});

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
    settingsWriteListener: fromCallback(({ sendBack }) => onSettingsChange((change) => sendBack({
      type: change === 'written' ? 'SETTINGS_WRITTEN' : change === 'replacing' ? 'DATA_REPLACING' : 'DATA_REPLACED',
    }))),
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
          const to = feature as FeatureRef;
          sendToSystem(to, { type: 'FEATURE_SETTINGS_UPDATED', settings, changes: detectAllArrayChanges(before ?? {}, settings) });
          sendToPlugin(to, { type: 'FEATURE_SETTINGS_UPDATED', settings });
        }
        return now;
      },
    }),

    /**
     * After the data was reset or replaced (an app reset, a backup imported), tells every feature its settings with no
     * changes: its data changed with them, so a diff across it (a tag renamed away, a mode removed) would have it
     * rewrite rows that are already gone
     */
    tellEveryFeature: assign({
      applied: () => {
        const now = appliedPluginSettings();
        for (const [feature, settings] of Object.entries(now)) {
          if (!splitRef(feature)) continue;
          const to = feature as FeatureRef;
          sendToSystem(to, { type: 'FEATURE_SETTINGS_UPDATED', settings: settings ?? {}, changes: null });
          sendToPlugin(to, { type: 'FEATURE_SETTINGS_UPDATED', settings: settings ?? {} });
        }
        return now;
      },
    }),

    // The settings plugin's view of all the settings, after a change it didn't make itself
    sendSettingsUpdate: () => broadcastSettings('SETTINGS_UPDATED'),

    refuseResetWhileReplacing: () => sendToPlugin('settings', {
      type: 'APP_RESET_FAILED',
      error: 'A backup is being imported. Reset the app once it has finished.',
    }),

    // A change the store can't take now (`whileBusy`), with the reason the state gives
    refuseChange: (_: unknown, { reason }: { reason: string }) =>
      sendToPlugin('settings', { type: 'SETTINGS_REFUSED', problems: [reason] }),

    getSettings: () => broadcastSettings('SETTINGS_LOADED'),
    
    // The plugin hears whether the change was stored, and why not: a settings form says "Saved" only then
    updateSettings: ({ event }) => {
      const ev = settingsSpec.typeOf('UPDATE_SETTINGS', event);
      // A plugin's settings are keyed by its ref, which the frontend resolves before sending and the store checks
      try {
        if (ev.entityType === 'plugin') settingsCommands.updatePluginSetting(settingsQueries.pluginSettingsRef(ev.label), ev.path, ev.value);
        else settingsCommands.updateSettings('general', ev.label, ev.path, ev.value);
      } catch (error) {
        refuseSettings(error, `Settings for ${ev.entityType} "${ev.label}" weren't saved`);
        return;
      }

      if (ev.entityType === 'plugin' && ev.label === ref('code') && ev.path[0] === 'cliPaths') {
        clearCliPathCache();
      }

      broadcastSettings('SETTINGS_UPDATED');
      sendToPlugin('settings', { type: 'SETTINGS_SAVED' });
    },

    replaceSettings: ({ event }) => {
      const ev = settingsSpec.typeOf('REPLACE_SETTINGS', event);
      try {
        settingsCommands.replaceSettings(ev.data);
      } catch (error) {
        refuseSettings(error, "The settings weren't replaced");
        return;
      }
      broadcastSettings('SETTINGS_UPDATED');
      sendToPlugin('settings', { type: 'SETTINGS_SAVED' });
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
          settingsCommands.updatePluginSetting(ref('code'), ['cliPaths'], { ...cliPaths(), [provider]: result.resolvedPath });
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
        const message = errorMessage(err);
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
        const message = errorMessage(err);
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
      const message = errorMessage(err);
      logger.error('Reset app failed', { error: err });
      sendToPlugin('settings', { type: 'APP_RESET_FAILED', error: message });
    },

  },
}).createMachine({
  id: 'settings',
  initial: 'idle',
  context: { applied: {} },
  entry: 'rememberAppliedSettings',
  invoke: [{ src: 'packSettingsListener' }, { src: 'settingsWriteListener' }],
  on: {
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
        // Every write reaches the features it changed through here, whoever made it
        SETTINGS_WRITTEN: { actions: 'tellChangedFeatures' },
        // A pack registered or left: its defaults came or went
        PACK_SETTINGS_CHANGED: { actions: ['sendSettingsUpdate', 'tellChangedFeatures'] },
        PACK_CHANGED: { actions: ['sendSettingsUpdate', 'tellChangedFeatures'] },
        DATA_REPLACING: { target: 'replacingData' },
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
    // A backup import is replacing the stored data. Its settings arrive past this system's writer and the migrations it
    // runs write through it, so a diff against what features were told would have them rewrite rows that came in with
    // it: nothing is told until it ends, when every feature hears its settings with no changes. A reset would race the
    // import over the same stores, so it is refused while one runs rather than started.
    replacingData: {
      on: {
        ...whileBusy('A backup is being imported. Change the settings once it has finished.'),
        DATA_REPLACED: { target: 'idle', actions: ['sendSettingsUpdate', 'tellEveryFeature'] },
        RESET_APP: { actions: 'refuseResetWhileReplacing' },
      },
    },
    // Serialized single-in-flight reset. Any further RESET_APP events are
    // ignored here; the frontend is about to full-reload on APP_RESET_COMPLETE.
    resetting: {
      tags: ['resetting'],
      on: whileBusy('The app is being reset. Change the settings once it has finished.'),
      invoke: {
        src: 'resetAppActor',
        // Writes and pack changes made by the reset aren't told as changes: tellEveryFeature re-baselines once it ends,
        // however it ends, since a reset that failed partway changed some of the data and settings already
        onDone: {
          target: 'idle',
          actions: ['tellEveryFeature', 'onResetComplete'],
        },
        onError: {
          target: 'idle',
          actions: ['tellEveryFeature', 'onResetFailed'],
        },
      },
    },
  },
});

const settingsEntry = { spec: settingsSpec, machine: settingsSystem } satisfies SystemEntry;

export default settingsEntry;
