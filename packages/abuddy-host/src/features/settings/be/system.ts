import type { Contract } from './contract.ts';
import type { OutgoingSettingsEvents } from './types.ts';
import { eventTypes } from '@abuddy/sdk/events';
import type { ApplicationHotkeys } from '@abuddy/sdk/types';
import { broadcastToPlugin, sendToSystem } from '../../../events.ts';
import { assign, setup, fromCallback, fromPromise, type ErrorActorEvent } from 'xstate';
import { defineSystem, getPackHelp, onPackSettingsDefaultsChanged } from '@abuddy/sdk/framework';
import { detectAllArrayChanges, errorMessage } from '@abuddy/sdk/utils/pure';
import { services } from '@abuddy/sdk/services';
import { createLogger, reportError } from '@abuddy/sdk/logger';
import { splitRef, type FeatureRef } from '@abuddy/sdk/ids';
import { PLUGINS_SECTION, SettingsRefusedError } from './document.ts';
import { answerSettings, type SettingsAnswer } from './answer.ts';
import type { SettingsDocument } from './store.ts';

/**
 * Where the app's shell reads its hotkeys in the settings document. The host knows this one path, not the shape of
 * the section around it: whoever registered `general` puts the hotkeys there, and the shell is told them.
 */
const APP_HOTKEYS_PATH = ['general', 'application', 'hotkeys'] as const;


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
 * What a refusal answers with: the store's own reasons, which are the user's to fix rather than a system error,
 * so only what the store *didn't* refuse (a bug here) is reported as one.
 *
 * It builds the answer rather than sending it, so the handlers can answer exactly once and from outside their
 * `try` — see `updateSettings`.
 */
function refusal(error: unknown, what: string): Extract<SettingsAnswer, { type: 'SETTINGS_REFUSED' }> {
  if (!(error instanceof SettingsRefusedError)) reportError({ error: new Error(`${what}: ${(error as Error).message}`), source: 'settings' });
  return {
    type: 'SETTINGS_REFUSED',
    problems: error instanceof SettingsRefusedError ? error.problems : [(error as Error).message],
  };
}

/** Each plugin's settings as they apply: what features were last told */
const appliedPluginSettings = (): Record<string, unknown> => ({ ...services.settings.getAll<SettingsDocument>().plugins });

/** What each feature was last told of its settings, by plugin ref */
/**
 * What the settings system takes while the stored data is being replaced or reset. A read is served, since it only
 * reports what is stored; a write is refused with `reason`, because storing it would either be lost with the data or
 * be taken for a change the user made. A settings form waits for the store's answer before it says "Saved", and the
 * settings page for a read before it renders, so dropping either leaves the user waiting for good.
 */
const whileBusy = (reason: string) => ({
  SEND_STATE: { actions: 'sendSettingsStartupData' as const },
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
    // The host resets the whole app: stores, each pack's onInit and boot apply, migrations
    resetAppActor: fromPromise(() => services.appData.reset()),
  },
  actions: settingsSpec.actions({
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

    /**
     * A change the store can't take now (`whileBusy`), with the reason the state gives.
     *
     * **It names the asker's call without being given one**, which a guard-level refusal could not do if a
     * correlation lived on the event: there is no `ev` here to thread one from. `reply` stamps the call it
     * was entered under, so this answer is as identifiable as the three that read an event.
     */
    refuseChange: ({ reply }, { reason }: { reason: string }) =>
      answerSettings(reply, { type: 'SETTINGS_REFUSED', problems: [reason] }),

    getSettings: () => broadcastSettings('SETTINGS_LOADED'),
    
    /**
     * Whoever asked hears whether the change was stored, and why not: a settings form says "Saved" only then,
     * and a drive session's `/set-setting` answers `ok: false` only then.
     *
     * **The outcome is a value and the answer is sent once, outside the `try`.** `reply()` throws for a message
     * that named no sender, and an answer sent from inside the `try` that threw would land in the `catch`,
     * which would answer again and throw out of the action. default-setup's database system says the same
     * thing where it does the same thing.
     */
    updateSettings: ({ event, reply }) => {
      const ev = settingsSpec.typeOf('UPDATE_SETTINGS', event);
      // A plugin's settings are keyed by its ref, which the frontend resolves before sending and the store checks
      const outcome = ((): SettingsAnswer => {
        try {
          if (ev.entityType === 'plugin') services.settings.setForFeature(ev.label as `${string}/${string}`, ev.path, ev.value);
          else services.settings.setInSection(ev.label, ev.path, ev.value);
        } catch (error) {
          return refusal(error, `Settings for ${ev.entityType} "${ev.label}" weren't saved`);
        }
        broadcastSettings('SETTINGS_UPDATED');
        return { type: 'SETTINGS_SAVED' };
      })();

      answerSettings(reply, outcome);
    },

    replaceSettings: ({ event, reply }) => {
      const ev = settingsSpec.typeOf('REPLACE_SETTINGS', event);
      const outcome = ((): SettingsAnswer => {
        try {
          services.settings.replaceAll(ev.data);
        } catch (error) {
          return refusal(error, "The settings weren't replaced");
        }
        broadcastSettings('SETTINGS_UPDATED');
        return { type: 'SETTINGS_SAVED' };
      })();

      answerSettings(reply, outcome);
    },

    // Answered like the other two writes: it was the one that said nothing at all on success, so a caller
    // could not tell a reset that worked from one that never arrived
    resetSettings: ({ event, reply }) => {
      const { target } = settingsSpec.typeOf('RESET_SETTINGS', event);
      const outcome = ((): SettingsAnswer => {
        try {
          // **Resetting is removing, not writing defaults back.** The row holds only what the user changed and
          // the store composes the registration's defaults underneath it, so dropping a slice is the whole of
          // it — and it is why this needs no new capability: `removeStored` has always been the narrow door,
          // reached until now only by migrations.
          if (!target) services.settings.reset();
          else if (target.entityType === 'plugin') services.settings.removeStored([PLUGINS_SECTION, target.label]);
          else services.settings.removeStored([target.label]);
        } catch (error) {
          return refusal(error, target
            ? `Settings for ${target.entityType} "${target.label}" weren't reset`
            : "The settings weren't reset");
        }
        broadcastSettings('SETTINGS_RESET');
        return { type: 'SETTINGS_SAVED' };
      })();

      answerSettings(reply, outcome);
    },
    
    // The stored keys changed: the view shows what there is now. What else acts on it hears the same event.
    secretsChanged: () => sendSecrets(),

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

  }),
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
        SEND_STATE: {
          actions: 'sendSettingsStartupData',
        },
        GET_SETTINGS: {
          actions: 'getSettings',
        },
        // Every write reaches the features it changed through here, whoever made it
        SETTINGS_WRITTEN: { actions: 'tellChangedFeatures' },
        // A pack registered or left: its defaults came or went
        PACK_SETTINGS_CHANGED: { actions: ['sendSettingsUpdate', 'tellChangedFeatures'] },
        // Still a fact handler, and `sendSettingsUpdate` is why: this plugin takes `SETTINGS_LOADED` only
        // while it is loading and `SETTINGS_UPDATED` once ready, so what publishing means here depends on
        // the receiver's state. The ask covers the first; this covers the second, with the help entries a
        // pack brought and the features whose defaults came or went
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
  'PACK_CONTENT_IMPORTED',
  'PACK_CONTENT_IMPORT_FAILED',
  'PACK_CONTENT_PREVIEW',
  'PACK_CONTENT_PREVIEW_FAILED',
  'APP_RESET_COMPLETE',
  'APP_RESET_FAILED',
  'SECRETS_UPDATED',
);
