import type { Contract } from './contract.ts';
import type { OutgoingSettingsEvents } from './types.ts';
import { eventTypes } from '@abuddy/sdk/events';
import type { ApplicationHotkeys } from '@abuddy/sdk/types';
import { broadcastToPlugin, sendToSystem } from '../../../events.ts';
import { assign, createMachine, setup, sendTo, enqueueActions, fromCallback, fromPromise, type ErrorActorEvent } from 'xstate';
import { defineSystem, getPackHelp, onPackSettingsDefaultsChanged, type HelpEntry, type SystemEntry } from '@abuddy/sdk/framework';
import { detectAllArrayChanges, errorMessage } from '@abuddy/sdk/utils/pure';
import { seedData, type SeedCounts, type SeedIncludeSet } from '@abuddy/sdk/utils';
import { previewPackSeeds, type PackSeedsPreview } from '@abuddy/sdk/seed';
import { services } from '@abuddy/sdk/services';
import type { SecretInfo, SecretsStatus } from '@abuddy/sdk/services';
import { createLogger, reportError } from '@abuddy/sdk/logger';
import { splitRef, type FeatureRef } from '@abuddy/sdk/ids';
import { HOST } from '../../../refs.ts';
import { SettingsRefusedError } from './document.ts';
import type { SettingsDocument } from './store.ts';

/**
 * Where the app's shell reads its hotkeys in the settings document. The host knows this one path, not the shape of
 * the section around it: whoever registered `general` puts the hotkeys there, and the shell is told them.
 */
const APP_HOTKEYS_PATH = ['general', 'application', 'hotkeys'] as const;

/**
 * The plugin that draws the settings, by the `settings` role. The store and this system are the app's; the view is
 * still a pack's, so it is addressed by the role it plays rather than by a name the host would have to know.
 */

/**
 * The application hotkeys, from the `general` section a pack contributes. Every section but `plugins` is a pack's
 * and opaque to the host, so `unknown` is what it can read and this is where it takes the pack's word for the
 * shape. Absent reads as none, rather than as `undefined` wearing the type the shell's context declares.
 */
const appHotkeys = (document: SettingsDocument): ApplicationHotkeys =>
  (at(document, APP_HOTKEYS_PATH) ?? {}) as ApplicationHotkeys;

const at = (document: SettingsDocument, path: readonly string[]): unknown =>
  path.reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined), document);

const logger = createLogger('settings');

/**
 * Convert the JSON-safe include shape from the frontend
 * (`null = all items, [] = skip, string[] = filter`) into the `SeedInclude`
 * structure consumed by `seedData`.
 */
function toSeedInclude(include: Record<string, string[] | null>): Record<string, SeedIncludeSet | undefined> {
  return Object.fromEntries(Object.entries(include).map(([key, items]) => [key, items === null ? true : new Set(items)]));
}

/**
 * Tells the settings plugin a change wasn't stored, with the store's reasons: a refusal is the user's to fix, not a
 * system error, so only what the store didn't refuse (a bug here) is reported as one
 */
function refuseSettings(error: unknown, what: string): void {
  if (!(error instanceof SettingsRefusedError)) reportError({ error: new Error(`${what}: ${(error as Error).message}`), source: 'settings' });
  broadcastToPlugin('settings', { type: 'SETTINGS_REFUSED', problems: error instanceof SettingsRefusedError ? error.problems : [(error as Error).message] });
}

/** Each plugin's settings as they apply: what features were last told */
const appliedPluginSettings = (): Record<string, unknown> => ({ ...(services.settings.getAll<SettingsDocument>().plugins ?? {}) });

/** What each feature was last told of its settings, by plugin ref */
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

export const settingsSpec = defineSystem<Contract>();

/**
 * Sends the settings plugin all the settings, as `type` (on first load with the FAQs), and the app shell the hotkeys
 * in them: whatever changed the settings, both views follow.
 */
function broadcastSettings(type: 'SETTINGS_LOADED' | 'SETTINGS_UPDATED' | 'SETTINGS_RESET'): void {
  const data = services.settings.getAll<SettingsDocument>();
  if (type === 'SETTINGS_LOADED') broadcastToPlugin('settings', { type, data, help: getPackHelp() });
  else broadcastToPlugin('settings', { type, data });
  broadcastToPlugin('application', { type: 'APPLICATION_HOTKEYS', hotkeys: appHotkeys(data) });
}

/** CLI path overrides, in the code plugin's settings */
/** Sends the settings plugin the stored API keys (no values) and how they're protected */
function sendSecrets(): void {
  broadcastToPlugin('settings', { type: 'SECRETS_UPDATED', secrets: services.secrets.list(), status: services.secrets.status() });
}

export const settingsSystem = setup({
  types: settingsSpec.types,
  actors: {
    packSettingsListener: fromCallback(({ sendBack }) => onPackSettingsDefaultsChanged(() => sendBack({ type: 'PACK_SETTINGS_CHANGED' }))),
    settingsWriteListener: fromCallback(({ sendBack }) => {
      const tell = (change: 'written' | 'replacing' | 'replaced') => sendBack({
        type: change === 'written' ? 'SETTINGS_WRITTEN' : change === 'replacing' ? 'DATA_REPLACING' : 'DATA_REPLACED',
      });
      return services.settings.onChange(tell);
    }),
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
          broadcastToPlugin(to, { type: 'FEATURE_SETTINGS_UPDATED', settings });
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
          broadcastToPlugin(to, { type: 'FEATURE_SETTINGS_UPDATED', settings: settings ?? {} });
        }
        return now;
      },
    }),

    // The settings plugin's view of all the settings, after a change it didn't make itself
    sendSettingsUpdate: () => broadcastSettings('SETTINGS_UPDATED'),

    // Help is a pack contribution, so the packs changing changes it; the settings ride along on PACK_CHANGED
    sendHelp: () => broadcastToPlugin('settings', { type: 'HELP_UPDATED', help: getPackHelp() }),

    refuseResetWhileReplacing: () => broadcastToPlugin('settings', {
      type: 'APP_RESET_FAILED',
      error: 'A backup is being imported. Reset the app once it has finished.',
    }),

    // A change the store can't take now (`whileBusy`), with the reason the state gives
    refuseChange: (_: unknown, { reason }: { reason: string }) =>
      broadcastToPlugin('settings', { type: 'SETTINGS_REFUSED', problems: [reason] }),

    getSettings: () => broadcastSettings('SETTINGS_LOADED'),
    
    // The plugin hears whether the change was stored, and why not: a settings form says "Saved" only then
    updateSettings: ({ event }) => {
      const ev = settingsSpec.typeOf('UPDATE_SETTINGS', event);
      // A plugin's settings are keyed by its ref, which the frontend resolves before sending and the store checks
      try {
        if (ev.entityType === 'plugin') services.settings.setForFeature(ev.label as `${string}/${string}`, ev.path, ev.value);
        else services.settings.setInSection(ev.label, ev.path, ev.value);
      } catch (error) {
        refuseSettings(error, `Settings for ${ev.entityType} "${ev.label}" weren't saved`);
        return;
      }

      broadcastSettings('SETTINGS_UPDATED');
      broadcastToPlugin('settings', { type: 'SETTINGS_SAVED' });
    },

    replaceSettings: ({ event }) => {
      const ev = settingsSpec.typeOf('REPLACE_SETTINGS', event);
      try {
        services.settings.replaceAll(ev.data);
      } catch (error) {
        refuseSettings(error, "The settings weren't replaced");
        return;
      }
      broadcastSettings('SETTINGS_UPDATED');
      broadcastToPlugin('settings', { type: 'SETTINGS_SAVED' });
    },

    resetSettings: () => {
      services.settings.reset();
      broadcastSettings('SETTINGS_RESET');
    },
    
    // The stored keys changed: the view shows what there is now. What else acts on it hears the same event.
    secretsChanged: () => sendSecrets(),

    previewPackSeeds: ({ event }) => {
      const ev = settingsSpec.typeOf('PREVIEW_PACK_SEEDS', event);
      try {
        const preview = previewPackSeeds(ev.directory);
        broadcastToPlugin('settings', { type: 'PACK_SEEDS_PREVIEW', preview });
      } catch (err) {
        const message = errorMessage(err);
        broadcastToPlugin('settings', { type: 'PACK_SEEDS_PREVIEW_FAILED', error: message });
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
        broadcastToPlugin('settings', { type: 'PACK_SEEDS_IMPORTED', result, errors });
        // The running systems read what the seeds changed (the chat's slash commands, the library's documents)
        sendToSystem('bus', { type: 'PACK_CHANGED', packId });
        if (ev.restartBrain) {
          sendToSystem({ role: 'brain' }, { type: 'RESTART_BRAIN' });
        }
      } catch (err) {
        const message = errorMessage(err);
        broadcastToPlugin('settings', { type: 'PACK_SEEDS_IMPORT_FAILED', error: message });
      }
    },

    onResetComplete: () => {
      sendToSystem({ role: 'brain' }, { type: 'RESTART_BRAIN' });
      sendToSystem({ role: 'threads' }, { type: 'COMMANDS_CHANGED' });
      broadcastToPlugin('settings', { type: 'APP_RESET_COMPLETE' });
    },

    onResetFailed: ({ event }) => {
      const err = (event as unknown as ErrorActorEvent).error;
      const message = errorMessage(err);
      logger.error('Reset app failed', { error: err });
      broadcastToPlugin('settings', { type: 'APP_RESET_FAILED', error: message });
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
        PACK_CHANGED: { actions: ['sendSettingsUpdate', 'sendHelp', 'tellChangedFeatures'] },
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

export const settingsEntry = { spec: settingsSpec, machine: settingsSystem };

/** The host `settings` system, as the app registers it */
export const createSettingsSystem = () => settingsSystem;

/** The event types the host `settings` system accepts */
export const settingsEvents = new Set([
  'CLIENT_CONNECTED', 'PACK_CHANGED',
  'GET_SETTINGS',
  'UPDATE_SETTINGS',
  'RESET_SETTINGS',
  'PREVIEW_PACK_SEEDS',
  'IMPORT_PACK_SEEDS',
  'REPLACE_SETTINGS',
  'RESET_APP',
  'PACK_SETTINGS_CHANGED',
  'SECRETS_CHANGED',
  'SETTINGS_WRITTEN',
  'DATA_REPLACING',
  'DATA_REPLACED',
]);

/** What the settings system sends its own plugin: everything outgoing but the shell's hotkeys */
export type SettingsPluginEvents = Exclude<OutgoingSettingsEvents, { type: 'APPLICATION_HOTKEYS' }>;

/** The event types the `settings` plugin receives; the host's to send, and no pack's */
export const SETTINGS_PLUGIN_EVENT_TYPES = eventTypes<SettingsPluginEvents>()(
  'SETTINGS_LOADED',
  'SETTINGS_UPDATED',
  'HELP_UPDATED',
  'SETTINGS_SAVED',
  'SETTINGS_REFUSED',
  'SETTINGS_RESET',
  'PACK_SEEDS_IMPORTED',
  'PACK_SEEDS_IMPORT_FAILED',
  'PACK_SEEDS_PREVIEW',
  'PACK_SEEDS_PREVIEW_FAILED',
  'APP_RESET_COMPLETE',
  'APP_RESET_FAILED',
  'SECRETS_UPDATED',
);
