import { assign, enqueueActions, setup, type ActorRefFrom } from 'xstate'
import breadcrumb from '@apack/sdk/fe'
import { safeEvents } from '@apack/sdk/fe'
import { type TrailClickEvent } from '@apack/sdk/fe'
import type { SettingsDocument } from '../be/store.ts'
import type { OutgoingSettingsEvents } from '../be/types.ts'
import type { SecretInfo, SecretsStatus } from '@apack/sdk/services'
import { sendToSystem } from '../../../events.ts'
import type { PackContentPreview } from '@apack/sdk/build'
import type { HelpEntry } from '@apack/sdk/framework';
import type { FeatureRef } from '@apack/sdk/ids';

import { splitRef } from '@apack/sdk/ids';

/* ─────────────────────────────────────────────────────────── */
/* Machine Types                                               */
/* ─────────────────────────────────────────────────────────── */
export const id = 'settings' as const;

// Use backend types directly

export type ImportMode = 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace';

export interface PackContentImport {
  status: 'idle' | 'previewing' | 'selecting' | 'importing' | 'success' | 'error';
  directory: string | null;
  preview: PackContentPreview | null;
  /** Per content key (as the preview lists them): the item keys currently ticked. */
  selection: Record<string, string[]>;
  /** Which content key rows are currently expanded in the UI. */
  expanded: Record<string, boolean>;
  importMode: ImportMode;
  restartBrain: boolean;
  result: Record<string, { created: number; updated: number; skipped: number }> | null;
  /** Records the import couldn't write, when it finished */
  errors: string[];
  error: string | null;
}


function freshContentImport(): PackContentImport {
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
  packContentImport: PackContentImport;
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
  /** With no `target`, every change the user made; with one, that section's or that feature's alone */
  | { type: 'SETTINGS.RESET'; target?: { entityType: 'section' | 'plugin'; label: string } }
  | { type: 'SETTINGS.LOAD' }
  | { type: 'CLI.TEST'; provider: string }
  | { type: 'PACK_CONTENT.PREVIEW'; directory: string }
  | { type: 'PACK_CONTENT.TOGGLE_EXPAND'; key: string }
  | { type: 'PACK_CONTENT.TOGGLE_TYPE_ALL'; key: string }
  | { type: 'PACK_CONTENT.TOGGLE_ITEM'; key: string; item: string }
  | { type: 'PACK_CONTENT.SET_MODE'; mode: 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace' }
  | { type: 'PACK_CONTENT.TOGGLE_RESTART_BRAIN' }
  | { type: 'PACK_CONTENT.CONFIRM_IMPORT' }
  | { type: 'PACK_CONTENT.CANCEL' }
  | { type: 'PACK_CONTENT.RESET_STATUS' }
  | { type: 'APP.RESET' }

export type SettingsEvents = UIEvent | OutgoingSettingsEvents | TrailClickEvent
  | { type: 'PACK_CONTENT_IMPORTED'; result: Record<string, { created: number; updated: number; skipped: number }>; errors: string[] }
  | { type: 'PACK_CONTENT_IMPORT_FAILED'; error: string }
  | { type: 'PACK_CONTENT_PREVIEW'; preview: PackContentPreview }
  | { type: 'PACK_CONTENT_PREVIEW_FAILED'; error: string }
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

export function createSettingsMachine(io: SettingsIO) {
  return setup({
  types: {
    context: {} as SettingsContext,
    events: {} as SettingsEvents,
  },
  actions: {
    /* ── bootstrap ─────────────────────────────────────── */
    loadSettings: () => {
      sendToSystem('settings', {
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
    updateSettings: enqueueActions(({ event: _event, enqueue }) => {
      enqueue.assign({ save: { status: 'saving', problems: [] } })
      enqueue('sendUpdate')
    }),

    sendUpdate: ({ event }) => {
      const ev = typeOf('SETTINGS.UPDATE', event);
      sendToSystem('settings', {
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
      enqueue(() => sendToSystem('settings', { type: 'REPLACE_SETTINGS', data }))
    }),

    settingsSaved: assign({ save: { status: 'saved', problems: [] } }),

    settingsRefused: assign(({ event }) => ({
      save: { status: 'refused' as const, problems: typeOf('SETTINGS_REFUSED', event).problems },
    })),

    resetSettings: ({ event }) => {
      const { target } = typeOf('SETTINGS.RESET', event);
      sendToSystem('settings', {
        type: 'RESET_SETTINGS',
        ...(target && { target }),
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

    previewPackContent: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_CONTENT.PREVIEW'; directory: string };
      // The packs system owns content orchestration; its answers come back to this plugin, which draws them
      sendToSystem('packs', {
        type: 'PREVIEW_PACK_CONTENT',
        directory: ev.directory,
      });
      return {
        packContentImport: {
          ...context.packContentImport,
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

    setContentPreview: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_CONTENT_PREVIEW'; preview: PackContentPreview };
      const selection = Object.fromEntries(Object.entries(ev.preview.content).map(([key, items]) => [key, items.map(i => i.key)]));
      return {
        packContentImport: {
          ...context.packContentImport,
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

    setContentPreviewFailed: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_CONTENT_PREVIEW_FAILED'; error: string };
      return {
        packContentImport: {
          ...context.packContentImport,
          status: 'error' as const,
          preview: null,
          result: null,
          errors: [],
          error: ev.error,
        },
      };
    }),

    toggleContentExpand: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_CONTENT.TOGGLE_EXPAND'; key: string };
      return {
        packContentImport: {
          ...context.packContentImport,
          expanded: {
            ...context.packContentImport.expanded,
            [ev.key]: !context.packContentImport.expanded[ev.key],
          },
        },
      };
    }),

    toggleContentTypeAll: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_CONTENT.TOGGLE_TYPE_ALL'; key: string };
      const preview = context.packContentImport.preview;
      if (!preview) return {};
      const currentlySelected = context.packContentImport.selection[ev.key] ?? [];
      const allKeys = (preview.content[ev.key] ?? []).map(i => i.key);
      const nextSelection = currentlySelected.length === allKeys.length ? [] : allKeys;
      return {
        packContentImport: {
          ...context.packContentImport,
          selection: {
            ...context.packContentImport.selection,
            [ev.key]: nextSelection,
          },
        },
      };
    }),

    toggleContentItem: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_CONTENT.TOGGLE_ITEM'; key: string; item: string };
      const current = context.packContentImport.selection[ev.key] ?? [];
      const next = current.includes(ev.item)
        ? current.filter(k => k !== ev.item)
        : [...current, ev.item];
      return {
        packContentImport: {
          ...context.packContentImport,
          selection: {
            ...context.packContentImport.selection,
            [ev.key]: next,
          },
        },
      };
    }),

    confirmContentImport: assign(({ context }) => {
      const { directory, preview, selection, importMode, restartBrain } = context.packContentImport;
      if (!directory || !preview) return {};

      // null = import all items of this key, [] = skip, string[] = filter.
      // An empty key should be skipped — not treated as "import everything".
      const toIncludeField = (key: string): string[] | null => {
        const selected = selection[key] ?? [];
        const total = preview.content[key].length;
        if (total === 0) return [];
        return selected.length === total ? null : selected;
      };

      sendToSystem('packs', {
        type: 'IMPORT_PACK_CONTENT',
        directory,
        include: Object.fromEntries(Object.keys(preview.content).map((key) => [key, toIncludeField(key)])),
        mode: importMode,
        restartBrain,
      });

      return {
        packContentImport: {
          ...context.packContentImport,
          status: 'importing' as const,
          result: null,
          errors: [],
          error: null,
        },
      };
    }),

    cancelContentImport: assign(() => ({
      packContentImport: freshContentImport(),
    })),

    setContentImported: assign(({ context, event }) => {
      const ev = event as Extract<SettingsEvents, { type: 'PACK_CONTENT_IMPORTED' }>;
      return {
        packContentImport: {
          ...context.packContentImport,
          status: 'success' as const,
          result: ev.result,
          errors: ev.errors,
          error: null,
        },
      };
    }),

    setContentImportFailed: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_CONTENT_IMPORT_FAILED'; error: string };
      return {
        packContentImport: {
          ...context.packContentImport,
          status: 'error' as const,
          result: null,
          errors: [],
          error: ev.error,
        },
      };
    }),

    resetContentImportStatus: assign(() => ({
      packContentImport: freshContentImport(),
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
    packContentImport: freshContentImport(),
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
        'PACK_CONTENT.PREVIEW': {
          actions: 'previewPackContent',
        },
        'PACK_CONTENT.TOGGLE_EXPAND': {
          actions: 'toggleContentExpand',
        },
        'PACK_CONTENT.TOGGLE_TYPE_ALL': {
          actions: 'toggleContentTypeAll',
        },
        'PACK_CONTENT.TOGGLE_ITEM': {
          actions: 'toggleContentItem',
        },
        'PACK_CONTENT.SET_MODE': {
          actions: assign(({ context, event }) => ({
            packContentImport: {
              ...context.packContentImport,
              importMode: (event as any).mode,
            },
          })),
        },
        'PACK_CONTENT.TOGGLE_RESTART_BRAIN': {
          actions: assign(({ context }) => ({
            packContentImport: {
              ...context.packContentImport,
              restartBrain: !context.packContentImport.restartBrain,
            },
          })),
        },
        'PACK_CONTENT.CONFIRM_IMPORT': {
          actions: 'confirmContentImport',
        },
        'PACK_CONTENT.CANCEL': {
          actions: 'cancelContentImport',
        },
        'PACK_CONTENT.RESET_STATUS': {
          actions: 'resetContentImportStatus',
        },
        PACK_CONTENT_PREVIEW: {
          actions: 'setContentPreview',
        },
        PACK_CONTENT_PREVIEW_FAILED: {
          actions: 'setContentPreviewFailed',
        },
        PACK_CONTENT_IMPORTED: {
          actions: 'setContentImported',
        },
        PACK_CONTENT_IMPORT_FAILED: {
          actions: 'setContentImportFailed',
        },
        'APP.RESET': {
          guard: ({ context }) => !context.resetting,
          actions: [
            assign({ resetting: true }),
            () => {
              sendToSystem('settings', { type: 'RESET_APP' });
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

export type SettingsState = ActorRefFrom<ReturnType<typeof createSettingsMachine>>;