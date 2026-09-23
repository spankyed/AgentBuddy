import { HOST } from '../../../refs.ts';
import { assign, enqueueActions, setup, type ActorRefFrom } from 'xstate'
import breadcrumb, { breadcrumbWithParams } from '@abuddy/sdk/fe'
import { safeEvents } from '@abuddy/sdk/fe'
import {
  targetIs,
  TRAIL_CLICK,
  type TrailClickEvent,
} from '@abuddy/sdk/fe'
import type { SettingsDocument } from '../be/store.ts'
import type { OutgoingSettingsEvents } from '../be/system.ts'
import type { SecretInfo, SecretsStatus } from '@abuddy/sdk/services'
import { sendToSystem } from '@abuddy/sdk/events'
import type { ApplicationHotkeys } from '@abuddy/sdk/types'
import type { EARS } from '@abuddy/sdk'
import type { PackSeedsPreview } from '@abuddy/sdk/build'
import type { HelpEntry } from '@abuddy/sdk/framework';
import type { FeatureRef } from '@abuddy/sdk/ids';

import { splitRef } from '@abuddy/sdk/ids';

/* ─────────────────────────────────────────────────────────── */
/* Machine Types                                               */
/* ─────────────────────────────────────────────────────────── */
export const id = 'settings' as const;

// Use backend types directly

export type ImportMode = 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace';

export interface PackSeedsImport {
  status: 'idle' | 'previewing' | 'selecting' | 'importing' | 'success' | 'error';
  directory: string | null;
  preview: PackSeedsPreview | null;
  /** Per seed key (as the preview lists them): the item keys currently ticked. */
  selection: Record<string, string[]>;
  /** Which seed key rows are currently expanded in the UI. */
  expanded: Record<string, boolean>;
  importMode: ImportMode;
  restartBrain: boolean;
  result: Record<string, { created: number; updated: number; skipped: number }> | null;
  /** Records the import couldn't seed, when it finished */
  errors: string[];
  error: string | null;
}


function freshPackSeeds(): PackSeedsImport {
  return {
    status: 'idle',
    directory: null,
    preview: null,
    selection: {},
    expanded: {},
    importMode: 'replace-on-collision',
    restartBrain: false,
    result: null,
    errors: [],
    error: null,
  };
}

/** The store's answer to the last settings change sent */
export interface SettingsSave {
  status: 'idle' | 'saving' | 'saved' | 'refused'
  problems: string[]
}

export interface SettingsContext {
  settings: SettingsDocument | null;
  help: HelpEntry[];
  /** The stored API keys, without values */
  secrets: SecretInfo[];
  secretsStatus: SecretsStatus | null;
  cliTestResults: Record<string, { status: 'idle' | 'testing' | 'success' | 'error'; resolvedPath?: string; error?: string }>;
  packSeedsImport: PackSeedsImport;
  activeTab: 'general' | 'plugins' | 'help';
  generalNavItem: 'personal' | 'secrets' | 'projects' | 'application' | 'json';
  selectedPluginId: string | null;
  isLoading: boolean;
  /** True while a RESET_APP mutation is in flight; used to disable the reset button. */
  resetting: boolean;
  /** The last change sent to the store: in flight, stored, or refused with why */
  save: SettingsSave;
}
/** What a settings change is to: a plugin's settings by their key (its ref), or a general section */
/**
 * What a change names: an installed feature's own settings by its ref, or a registered section by the name whoever
 * registered it gave. `label` is the whole address at its level — a section's sub-key belongs in `path`, so that one
 * target means one place in the document whoever builds it.
 */
export type SettingsTarget = { entityType: 'plugin'; label: FeatureRef } | { entityType: 'section'; label: string };

type UIEvent =
  | { type: 'TAB.SELECT'; tab: 'general' | 'plugins' | 'help' }
  | { type: 'GENERAL_NAV.SELECT'; item: 'personal' | 'secrets' | 'projects' | 'application' | 'json' }
  // A plugin by its ref: other packs send it too, so a bare name would be read as this pack's
  | { type: 'PLUGIN.SELECT'; pluginId: FeatureRef }
  | ({ type: 'SETTINGS.UPDATE'; path: string[]; value: any } & SettingsTarget)
  | { type: 'SETTINGS.REPLACE'; data: unknown }
  | { type: 'SETTINGS.RESET' }
  | { type: 'SETTINGS.LOAD' }
  | { type: 'CLI.TEST'; provider: string }
  | { type: 'PACK_SEEDS.PREVIEW'; directory: string }
  | { type: 'PACK_SEEDS.TOGGLE_EXPAND'; key: string }
  | { type: 'PACK_SEEDS.TOGGLE_TYPE_ALL'; key: string }
  | { type: 'PACK_SEEDS.TOGGLE_ITEM'; key: string; item: string }
  | { type: 'PACK_SEEDS.SET_MODE'; mode: 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace' }
  | { type: 'PACK_SEEDS.TOGGLE_RESTART_BRAIN' }
  | { type: 'PACK_SEEDS.CONFIRM_IMPORT' }
  | { type: 'PACK_SEEDS.CANCEL' }
  | { type: 'PACK_SEEDS.RESET_STATUS' }
  | { type: 'APP.RESET' }

export type SettingsEvents = UIEvent | OutgoingSettingsEvents | TrailClickEvent
  | { type: 'PACK_SEEDS_IMPORTED'; result: Record<string, { created: number; updated: number; skipped: number }>; errors: string[] }
  | { type: 'PACK_SEEDS_IMPORT_FAILED'; error: string }
  | { type: 'PACK_SEEDS_PREVIEW'; preview: PackSeedsPreview }
  | { type: 'PACK_SEEDS_PREVIEW_FAILED'; error: string }
  | { type: 'APP_RESET_COMPLETE' }
  | { type: 'APP_RESET_FAILED'; error: string }
  | { type: 'CLI_TEST_RESULT'; provider: string; success: boolean; error?: string; resolvedPath?: string }
const typeOf = safeEvents<SettingsEvents>()

/** The two acts only a window can do, which this machine asks for rather than reaching a browser global */
export interface SettingsIO {
  /** Start the app over, once a reset has finished */
  restart(): void;
  /** Tell the user something went wrong */
  report(message: string): void;
}

function buildSettingsMachine(io: SettingsIO) {
  return setup({
  types: {
    context: {} as SettingsContext,
    events: {} as SettingsEvents,
  },
  actions: {
    /* ── bootstrap ─────────────────────────────────────── */
    loadSettings: () => {
      sendToSystem(HOST.settings, {
        type: 'GET_SETTINGS',
      });
    },

    setSettingsData: assign(({ event }) => {
      const ev = typeOf('SETTINGS_LOADED', event);
      return {
        settings: ev.data,
        help: ev.help ?? [],
        isLoading: false,
      };
    }),

    // The installed packs changed: what any of them answers with in Help changed with them
    setHelp: assign(({ event }) => ({ help: typeOf('HELP_UPDATED', event).help })),

    setSecrets: assign(({ event }) => {
      const ev = typeOf('SECRETS_UPDATED', event);
      return { secrets: ev.secrets, secretsStatus: ev.status };
    }),

    updateSettingsData: assign(({ event }) => {
      const ev = typeOf('SETTINGS_UPDATED', event);
      return {
        settings: ev.data,
      }
    }),

    /* ── tab navigation ────────────────────────────────── */
    selectTab: assign(({ event }) => {
      const ev = typeOf('TAB.SELECT', event);
      return {
        activeTab: ev.tab,
      }
    }),

    selectGeneralNavItem: assign(({ event }) => {
      const ev = typeOf('GENERAL_NAV.SELECT', event);
      return {
        generalNavItem: ev.item,
      }
    }),

    selectPlugin: assign(({ context, event }) => {
      const ev = typeOf('PLUGIN.SELECT', event);
      // Another pack may send it, so a bad one is reported and ignored rather than stopping the settings plugin
      if (!splitRef(ev.pluginId)) {
        console.error(`PLUGIN.SELECT names "${ev.pluginId}", which isn't a plugin's ref, "<packId>/<featureId>"`);
        return { selectedPluginId: context.selectedPluginId };
      }
      return { selectedPluginId: ev.pluginId };
    }),

    /* ── settings updates ────────────────────────────── */
    updateSettings: enqueueActions(({ event, enqueue }) => {
      enqueue.assign({ save: { status: 'saving', problems: [] } })
      enqueue('sendUpdate')
    }),

    sendUpdate: ({ event }) => {
      const ev = typeOf('SETTINGS.UPDATE', event);
      sendToSystem(HOST.settings, {
        type: 'UPDATE_SETTINGS',
        entityType: ev.entityType,
        label: ev.label,
        path: ev.path,
        value: ev.value,
      });
    },

    replaceSettings: enqueueActions(({ event, enqueue }) => {
      const { data } = typeOf('SETTINGS.REPLACE', event)
      enqueue.assign({ save: { status: 'saving', problems: [] } })
      enqueue(() => sendToSystem(HOST.settings, { type: 'REPLACE_SETTINGS', data }))
    }),

    settingsSaved: assign({ save: { status: 'saved', problems: [] } }),

    settingsRefused: assign(({ event }) => ({
      save: { status: 'refused' as const, problems: typeOf('SETTINGS_REFUSED', event).problems },
    })),

    resetSettings: () => {
      sendToSystem(HOST.settings, {
        type: 'RESET_SETTINGS',
      });
    },

    testCliProvider: assign(({ context, event }) => {
      const ev = typeOf('CLI.TEST', event);
      // The code feature resolves CLIs: `resolve-cli` and the stored paths are its own
      sendToSystem({ role: 'code' }, {
        type: 'TEST_CLI_PROVIDER',
        provider: ev.provider,
      });
      return {
        cliTestResults: { ...context.cliTestResults, [ev.provider]: { status: 'testing' as const } },
      };
    }),

    setCliTestResult: assign(({ context, event }) => {
      const ev = event as { type: 'CLI_TEST_RESULT'; provider: string; success: boolean; error?: string; resolvedPath?: string };
      return {
        cliTestResults: {
          ...context.cliTestResults,
          [ev.provider]: {
            status: ev.success ? 'success' as const : 'error' as const,
            resolvedPath: ev.resolvedPath,
            error: ev.error,
          },
        },
      };
    }),

    previewPackSeeds: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_SEEDS.PREVIEW'; directory: string };
      sendToSystem(HOST.settings, {
        type: 'PREVIEW_PACK_SEEDS',
        directory: ev.directory,
      });
      return {
        packSeedsImport: {
          ...context.packSeedsImport,
          status: 'previewing' as const,
          directory: ev.directory,
          preview: null,
          selection: {},
          expanded: {},
          result: null,
          errors: [],
          error: null,
        },
      };
    }),

    setPackSeedsPreview: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_SEEDS_PREVIEW'; preview: PackSeedsPreview };
      const selection = Object.fromEntries(Object.entries(ev.preview.seeds).map(([key, items]) => [key, items.map(i => i.key)]));
      return {
        packSeedsImport: {
          ...context.packSeedsImport,
          status: 'selecting' as const,
          preview: ev.preview,
          selection,
          expanded: {},
          result: null,
          errors: [],
          error: null,
        },
      };
    }),

    setPackSeedsPreviewFailed: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_SEEDS_PREVIEW_FAILED'; error: string };
      return {
        packSeedsImport: {
          ...context.packSeedsImport,
          status: 'error' as const,
          preview: null,
          result: null,
          errors: [],
          error: ev.error,
        },
      };
    }),

    togglePackSeedsExpand: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_SEEDS.TOGGLE_EXPAND'; key: string };
      return {
        packSeedsImport: {
          ...context.packSeedsImport,
          expanded: {
            ...context.packSeedsImport.expanded,
            [ev.key]: !context.packSeedsImport.expanded[ev.key],
          },
        },
      };
    }),

    togglePackSeedsTypeAll: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_SEEDS.TOGGLE_TYPE_ALL'; key: string };
      const preview = context.packSeedsImport.preview;
      if (!preview) return {};
      const currentlySelected = context.packSeedsImport.selection[ev.key] ?? [];
      const allKeys = (preview.seeds[ev.key] ?? []).map(i => i.key);
      const nextSelection = currentlySelected.length === allKeys.length ? [] : allKeys;
      return {
        packSeedsImport: {
          ...context.packSeedsImport,
          selection: {
            ...context.packSeedsImport.selection,
            [ev.key]: nextSelection,
          },
        },
      };
    }),

    togglePackSeedsItem: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_SEEDS.TOGGLE_ITEM'; key: string; item: string };
      const current = context.packSeedsImport.selection[ev.key] ?? [];
      const next = current.includes(ev.item)
        ? current.filter(k => k !== ev.item)
        : [...current, ev.item];
      return {
        packSeedsImport: {
          ...context.packSeedsImport,
          selection: {
            ...context.packSeedsImport.selection,
            [ev.key]: next,
          },
        },
      };
    }),

    confirmPackSeedsImport: assign(({ context }) => {
      const { directory, preview, selection, importMode, restartBrain } = context.packSeedsImport;
      if (!directory || !preview) return {};

      // null = import all items of this key, [] = skip, string[] = filter.
      // An empty key should be skipped — not treated as "import everything".
      const toIncludeField = (key: string): string[] | null => {
        const selected = selection[key] ?? [];
        const total = preview.seeds[key].length;
        if (total === 0) return [];
        return selected.length === total ? null : selected;
      };

      sendToSystem(HOST.settings, {
        type: 'IMPORT_PACK_SEEDS',
        directory,
        include: Object.fromEntries(Object.keys(preview.seeds).map((key) => [key, toIncludeField(key)])),
        mode: importMode,
        restartBrain,
      });

      return {
        packSeedsImport: {
          ...context.packSeedsImport,
          status: 'importing' as const,
          result: null,
          errors: [],
          error: null,
        },
      };
    }),

    cancelPackSeeds: assign(() => ({
      packSeedsImport: freshPackSeeds(),
    })),

    setPackSeedsImported: assign(({ context, event }) => {
      const ev = event as Extract<SettingsEvents, { type: 'PACK_SEEDS_IMPORTED' }>;
      return {
        packSeedsImport: {
          ...context.packSeedsImport,
          status: 'success' as const,
          result: ev.result,
          errors: ev.errors,
          error: null,
        },
      };
    }),

    setPackSeedsImportFailed: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_SEEDS_IMPORT_FAILED'; error: string };
      return {
        packSeedsImport: {
          ...context.packSeedsImport,
          status: 'error' as const,
          result: null,
          errors: [],
          error: ev.error,
        },
      };
    }),

    resetPackSeedsStatus: assign(() => ({
      packSeedsImport: freshPackSeeds(),
    })),
  },
  }).createMachine({
  id,
  
  initial: 'loading',
  context: () => ({
    settings: null,
    help: [],
    secrets: [],
    secretsStatus: null,
    cliTestResults: {},
    packSeedsImport: freshPackSeeds(),
    activeTab: 'general',
    generalNavItem: 'application',
    selectedPluginId: null as string | null,
    isLoading: true,
    resetting: false,
    save: { status: 'idle', problems: [] },
  }),
  states: {
    loading: {
      entry: 'loadSettings',
      on: {
        SETTINGS_LOADED: {
          target: 'ready',
          actions: 'setSettingsData',
        },
      },
    },
    ready: {
      meta: breadcrumb('settings', 'Settings', true),
      on: {
        'TAB.SELECT': {
          actions: 'selectTab',
        },
        'GENERAL_NAV.SELECT': {
          actions: 'selectGeneralNavItem',
        },
        'PLUGIN.SELECT': {
          actions: 'selectPlugin',
        },
        'SETTINGS.UPDATE': {
          actions: 'updateSettings',
        },
        'SETTINGS.REPLACE': {
          actions: 'replaceSettings',
        },
        SETTINGS_SAVED: {
          actions: 'settingsSaved',
        },
        SETTINGS_REFUSED: {
          actions: 'settingsRefused',
        },
        'SETTINGS.RESET': {
          actions: 'resetSettings',
        },
        'SETTINGS.LOAD': {
          target: 'loading',
        },
        SETTINGS_UPDATED: {
          actions: 'updateSettingsData',
        },
        HELP_UPDATED: {
          actions: 'setHelp',
        },
        SETTINGS_RESET: {
          actions: 'updateSettingsData',
        },
        SECRETS_UPDATED: {
          actions: 'setSecrets',
        },
        'CLI.TEST': {
          actions: 'testCliProvider',
        },
        'CLI_TEST_RESULT': {
          actions: 'setCliTestResult',
        },
        'PACK_SEEDS.PREVIEW': {
          actions: 'previewPackSeeds',
        },
        'PACK_SEEDS.TOGGLE_EXPAND': {
          actions: 'togglePackSeedsExpand',
        },
        'PACK_SEEDS.TOGGLE_TYPE_ALL': {
          actions: 'togglePackSeedsTypeAll',
        },
        'PACK_SEEDS.TOGGLE_ITEM': {
          actions: 'togglePackSeedsItem',
        },
        'PACK_SEEDS.SET_MODE': {
          actions: assign(({ context, event }) => ({
            packSeedsImport: {
              ...context.packSeedsImport,
              importMode: (event as any).mode,
            },
          })),
        },
        'PACK_SEEDS.TOGGLE_RESTART_BRAIN': {
          actions: assign(({ context }) => ({
            packSeedsImport: {
              ...context.packSeedsImport,
              restartBrain: !context.packSeedsImport.restartBrain,
            },
          })),
        },
        'PACK_SEEDS.CONFIRM_IMPORT': {
          actions: 'confirmPackSeedsImport',
        },
        'PACK_SEEDS.CANCEL': {
          actions: 'cancelPackSeeds',
        },
        'PACK_SEEDS.RESET_STATUS': {
          actions: 'resetPackSeedsStatus',
        },
        PACK_SEEDS_PREVIEW: {
          actions: 'setPackSeedsPreview',
        },
        PACK_SEEDS_PREVIEW_FAILED: {
          actions: 'setPackSeedsPreviewFailed',
        },
        PACK_SEEDS_IMPORTED: {
          actions: 'setPackSeedsImported',
        },
        PACK_SEEDS_IMPORT_FAILED: {
          actions: 'setPackSeedsImportFailed',
        },
        'APP.RESET': {
          guard: ({ context }) => !context.resetting,
          actions: [
            assign({ resetting: true }),
            () => {
              sendToSystem(HOST.settings, { type: 'RESET_APP' });
            },
          ],
        },
        APP_RESET_COMPLETE: {
          // Starting over is the window's act, not this machine's
          actions: () => io.restart(),
        },
        APP_RESET_FAILED: {
          actions: [
            assign({ resetting: false }),
            ({ event }: { event: any }) => io.report(`Reset failed: ${event.error}`),
          ],
        },
      },
    },
    },
  });
}

/**
 * The Settings plugin's machine, over the two acts only a window can do: starting the app over once a reset has
 * finished, and telling the user a reset failed. The renderer passes the window's; a test passes fakes.
 */
export const createSettingsMachine = buildSettingsMachine;

export type SettingsState = ActorRefFrom<ReturnType<typeof createSettingsMachine>>;