import { assign, setup, type ActorRefFrom } from 'xstate'
import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb'
import { safeEvents } from '@/core/types/safe-events'
import {
  targetIs,
  TRAIL_CLICK,
  type TrailClickEvent,
} from '@/core/actors/route-trailer'
import type { EARS, OutgoingSettingsEvents, SettingsData, GeneralSettings, PersonalInfo, Secrets, ApplicationHotkeys, PluginSettings, SetupPackPreview, SetupPackType, FAQItem } from '@app/api'
import { trpc } from '@/core/trpc'
import plugins from '@/plugins'
import { applicationState } from '@/main'

/* ─────────────────────────────────────────────────────────── */
/* Machine Types                                               */
/* ─────────────────────────────────────────────────────────── */
export const id = 'settings'
export type SettingsState = ActorRefFrom<typeof settingsState>

// Use backend types directly

export type ImportMode = 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace';

export interface SetupPackImport {
  status: 'idle' | 'previewing' | 'selecting' | 'importing' | 'success' | 'error';
  directory: string | null;
  preview: SetupPackPreview | null;
  /** Per-type selection: array of keys currently ticked. */
  selection: Record<SetupPackType, string[]>;
  /** Which type rows are currently expanded in the UI. */
  expanded: Record<SetupPackType, boolean>;
  importMode: ImportMode;
  restartBrain: boolean;
  result: any | null;
  error: string | null;
}

// Read-only templates. Consumers must use `freshSetupPack()` (or spread)
// so the module-level defaults stay pristine.
const EMPTY_SELECTION: Record<SetupPackType, string[]> = {
  actions: [], prompts: [], flows: [], library: [], notes: [], settings: [],
};
const COLLAPSED: Record<SetupPackType, boolean> = {
  actions: false, prompts: false, flows: false, library: false, notes: false, settings: false,
};

function freshSetupPack(): SetupPackImport {
  return {
    status: 'idle',
    directory: null,
    preview: null,
    selection: { ...EMPTY_SELECTION },
    expanded: { ...COLLAPSED },
    importMode: 'replace-on-collision',
    restartBrain: false,
    result: null,
    error: null,
  };
}

export interface SettingsContext {
  settings: SettingsData | null;
  faqs: FAQItem[];
  secretsData: any[];
  cliTestResults: Record<string, { status: 'idle' | 'testing' | 'success' | 'error'; resolvedPath?: string; error?: string }>;
  setupPackImport: SetupPackImport;
  activeTab: 'general' | 'plugins' | 'help';
  generalNavItem: 'personal' | 'secrets' | 'projects' | 'application' | 'json';
  selectedPluginId: string | null;
  isLoading: boolean;
  /** True while a RESET_APP mutation is in flight; used to disable the reset button. */
  resetting: boolean;
}
type UIEvent =
  | { type: 'TAB.SELECT'; tab: 'general' | 'plugins' | 'help' }
  | { type: 'GENERAL_NAV.SELECT'; item: 'personal' | 'secrets' | 'projects' | 'application' | 'json' }
  | { type: 'PLUGIN.SELECT'; pluginId: string }
  | { type: 'SETTINGS.UPDATE'; entityType: 'general' | 'plugin'; label: string; path: string[]; value: any }
  | { type: 'SETTINGS.REPLACE'; data: SettingsData }
  | { type: 'SETTINGS.RESET' }
  | { type: 'SETTINGS.LOAD' }
  | { type: 'CLI.TEST'; provider: string }
  | { type: 'SETUP_PACK.PREVIEW'; directory: string }
  | { type: 'SETUP_PACK.TOGGLE_EXPAND'; key: SetupPackType }
  | { type: 'SETUP_PACK.TOGGLE_TYPE_ALL'; key: SetupPackType }
  | { type: 'SETUP_PACK.TOGGLE_ITEM'; key: SetupPackType; item: string }
  | { type: 'SETUP_PACK.SET_MODE'; mode: 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace' }
  | { type: 'SETUP_PACK.TOGGLE_RESTART_BRAIN' }
  | { type: 'SETUP_PACK.CONFIRM_IMPORT' }
  | { type: 'SETUP_PACK.CANCEL' }
  | { type: 'SETUP_PACK.RESET_STATUS' }
  | { type: 'APP.RESET' }

export type SettingsEvents = UIEvent | OutgoingSettingsEvents | TrailClickEvent
  | { type: 'SETUP_PACK_IMPORTED'; result: any }
  | { type: 'SETUP_PACK_IMPORT_FAILED'; error: string }
  | { type: 'SETUP_PACK_PREVIEW'; preview: SetupPackPreview }
  | { type: 'SETUP_PACK_PREVIEW_FAILED'; error: string }
  | { type: 'APP_RESET_COMPLETE' }
  | { type: 'APP_RESET_FAILED'; error: string }
  | { type: 'SECRETS.EVENT.LOADED'; data: any[] }
  | { type: 'SECRETS.EVENT.CREATED'; id: string; provider: string; customName?: string }
  | { type: 'SECRETS.EVENT.UPDATED'; id: string }
  | { type: 'SECRETS.EVENT.DELETED'; id: string }
  | { type: 'SECRETS.EVENT.ERROR'; message: string }
  | { type: 'CLI_TEST_RESULT'; provider: string; success: boolean; error?: string; resolvedPath?: string }
const typeOf = safeEvents<SettingsEvents>()

const settingsState = setup({
  types: {
    context: {} as SettingsContext,
    events: {} as SettingsEvents,
  },
  actions: {
    /* ── bootstrap ─────────────────────────────────────── */
    loadSettings: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'GET_SETTINGS',
      });
    },

    setSettingsData: assign(({ event }) => {
      const ev = typeOf('SETTINGS_LOADED', event);

      // Send plugin visibility to application state on initial load
      if (ev.data?.plugins?._meta?.visibility) {
        applicationState.send({
          type: 'PLUGIN_VISIBILITY_UPDATED',
          pluginVisibility: ev.data.plugins._meta.visibility
        });
      }

      return {
        settings: ev.data,
        faqs: ev.faqs ?? [],
        isLoading: false,
      }
    }),

    setSecretsData: assign(({ event }) => {
      const ev = event as { type: 'SECRETS.EVENT.LOADED'; data: any[] };
      return {
        secretsData: ev.data
      };
    }),

    updateSettingsData: assign(({ event }) => {
      const ev = typeOf('SETTINGS_UPDATED', event);
      
      // Send plugin visibility updates to application state
      if (ev.data?.plugins?._meta?.visibility) {
        applicationState.send({
          type: 'PLUGIN_VISIBILITY_UPDATED',
          pluginVisibility: ev.data.plugins._meta.visibility
        });
      }
      
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

    selectPlugin: assign(({ event }) => {
      const ev = typeOf('PLUGIN.SELECT', event);
      return {
        selectedPluginId: ev.pluginId,
      }
    }),

    /* ── settings updates ────────────────────────────── */
    updateSettings: ({ event }) => {
      const ev = typeOf('SETTINGS.UPDATE', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_SETTINGS',
        entityType: ev.entityType,
        label: ev.label,
        path: ev.path,
        value: ev.value,
      });
    },

    replaceSettings: ({ event }) => {
      const ev = typeOf('SETTINGS.REPLACE', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'REPLACE_SETTINGS',
        data: ev.data,
      });
    },

    resetSettings: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'RESET_SETTINGS',
      });
    },

    testCliProvider: assign(({ context, event }) => {
      const ev = typeOf('CLI.TEST', event);
      trpc.bus.send.mutate({
        systemId: id,
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

    previewSetupPack: assign(({ context, event }) => {
      const ev = event as { type: 'SETUP_PACK.PREVIEW'; directory: string };
      trpc.bus.send.mutate({
        systemId: id,
        type: 'PREVIEW_SETUP_PACK',
        directory: ev.directory,
      } as any);
      return {
        setupPackImport: {
          ...context.setupPackImport,
          status: 'previewing' as const,
          directory: ev.directory,
          preview: null,
          selection: { ...EMPTY_SELECTION },
          expanded: { ...COLLAPSED },
          result: null,
          error: null,
        },
      };
    }),

    setSetupPackPreview: assign(({ context, event }) => {
      const ev = event as { type: 'SETUP_PACK_PREVIEW'; preview: SetupPackPreview };
      const selection: Record<SetupPackType, string[]> = {
        actions: ev.preview.actions.map(i => i.key),
        prompts: ev.preview.prompts.map(i => i.key),
        flows: ev.preview.flows.map(i => i.key),
        library: ev.preview.library.map(i => i.key),
        notes: ev.preview.notes.map(i => i.key),
        settings: ev.preview.settings.map(i => i.key),
      };
      return {
        setupPackImport: {
          ...context.setupPackImport,
          status: 'selecting' as const,
          preview: ev.preview,
          selection,
          expanded: { ...COLLAPSED },
          result: null,
          error: null,
        },
      };
    }),

    setSetupPackPreviewFailed: assign(({ context, event }) => {
      const ev = event as { type: 'SETUP_PACK_PREVIEW_FAILED'; error: string };
      return {
        setupPackImport: {
          ...context.setupPackImport,
          status: 'error' as const,
          preview: null,
          result: null,
          error: ev.error,
        },
      };
    }),

    toggleSetupPackExpand: assign(({ context, event }) => {
      const ev = event as { type: 'SETUP_PACK.TOGGLE_EXPAND'; key: SetupPackType };
      return {
        setupPackImport: {
          ...context.setupPackImport,
          expanded: {
            ...context.setupPackImport.expanded,
            [ev.key]: !context.setupPackImport.expanded[ev.key],
          },
        },
      };
    }),

    toggleSetupPackTypeAll: assign(({ context, event }) => {
      const ev = event as { type: 'SETUP_PACK.TOGGLE_TYPE_ALL'; key: SetupPackType };
      const preview = context.setupPackImport.preview;
      if (!preview) return {};
      const currentlySelected = context.setupPackImport.selection[ev.key];
      const allKeys = preview[ev.key].map(i => i.key);
      const nextSelection = currentlySelected.length === allKeys.length ? [] : allKeys;
      return {
        setupPackImport: {
          ...context.setupPackImport,
          selection: {
            ...context.setupPackImport.selection,
            [ev.key]: nextSelection,
          },
        },
      };
    }),

    toggleSetupPackItem: assign(({ context, event }) => {
      const ev = event as { type: 'SETUP_PACK.TOGGLE_ITEM'; key: SetupPackType; item: string };
      const current = context.setupPackImport.selection[ev.key];
      const next = current.includes(ev.item)
        ? current.filter(k => k !== ev.item)
        : [...current, ev.item];
      return {
        setupPackImport: {
          ...context.setupPackImport,
          selection: {
            ...context.setupPackImport.selection,
            [ev.key]: next,
          },
        },
      };
    }),

    confirmSetupPackImport: assign(({ context }) => {
      const { directory, preview, selection, importMode, restartBrain } = context.setupPackImport;
      if (!directory || !preview) return {};

      // null = import all items of this type, [] = skip, string[] = filter.
      // A zero-total type (missing from the pack, or simply empty) should be
      // skipped — not treated as "import everything".
      const toIncludeField = (key: SetupPackType): string[] | null => {
        const selected = selection[key];
        const total = preview[key].length;
        if (total === 0) return [];
        return selected.length === total ? null : selected;
      };

      trpc.bus.send.mutate({
        systemId: id,
        type: 'IMPORT_SETUP_PACK',
        directory,
        include: {
          actions: toIncludeField('actions'),
          prompts: toIncludeField('prompts'),
          flows: toIncludeField('flows'),
          library: toIncludeField('library'),
          notes: toIncludeField('notes'),
          settings: toIncludeField('settings'),
        },
        mode: importMode,
        restartBrain,
      } as any);

      return {
        setupPackImport: {
          ...context.setupPackImport,
          status: 'importing' as const,
          result: null,
          error: null,
        },
      };
    }),

    cancelSetupPack: assign(() => ({
      setupPackImport: freshSetupPack(),
    })),

    setSetupPackImported: assign(({ context, event }) => {
      const ev = event as { type: 'SETUP_PACK_IMPORTED'; result: any };
      return {
        setupPackImport: {
          ...context.setupPackImport,
          status: 'success' as const,
          result: ev.result,
          error: null,
        },
      };
    }),

    setSetupPackImportFailed: assign(({ context, event }) => {
      const ev = event as { type: 'SETUP_PACK_IMPORT_FAILED'; error: string };
      return {
        setupPackImport: {
          ...context.setupPackImport,
          status: 'error' as const,
          result: null,
          error: ev.error,
        },
      };
    }),

    resetSetupPackStatus: assign(() => ({
      setupPackImport: freshSetupPack(),
    })),
  },
}).createMachine({
  id,
  initial: 'loading',
  context: () => {
    // Get plugins with settings
    const pluginsWithSettings = plugins.filter(plugin => plugin.settings)
    // Set first plugin as default if available
    const defaultPluginId = pluginsWithSettings.length > 0 ? pluginsWithSettings[0].id : null
    
    return {
      settings: null,
      faqs: [],
      secretsData: [],
      cliTestResults: {},
      setupPackImport: freshSetupPack(),
      activeTab: 'general',
      generalNavItem: 'application',
      selectedPluginId: defaultPluginId,
      isLoading: true,
      resetting: false,
    }
  },
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
        'SETTINGS.RESET': {
          actions: 'resetSettings',
        },
        'SETTINGS.LOAD': {
          target: 'loading',
        },
        SETTINGS_UPDATED: {
          actions: 'updateSettingsData',
        },
        SETTINGS_RESET: {
          actions: 'updateSettingsData',
        },
        'SECRETS.EVENT.LOADED': {
          actions: 'setSecretsData',
        },
        'SECRETS.EVENT.CREATED': {},
        'SECRETS.EVENT.UPDATED': {},
        'SECRETS.EVENT.DELETED': {},
        'SECRETS.EVENT.ERROR': {},
        'CLI.TEST': {
          actions: 'testCliProvider',
        },
        'CLI_TEST_RESULT': {
          actions: 'setCliTestResult',
        },
        'SETUP_PACK.PREVIEW': {
          actions: 'previewSetupPack',
        },
        'SETUP_PACK.TOGGLE_EXPAND': {
          actions: 'toggleSetupPackExpand',
        },
        'SETUP_PACK.TOGGLE_TYPE_ALL': {
          actions: 'toggleSetupPackTypeAll',
        },
        'SETUP_PACK.TOGGLE_ITEM': {
          actions: 'toggleSetupPackItem',
        },
        'SETUP_PACK.SET_MODE': {
          actions: assign(({ context, event }) => ({
            setupPackImport: {
              ...context.setupPackImport,
              importMode: (event as any).mode,
            },
          })),
        },
        'SETUP_PACK.TOGGLE_RESTART_BRAIN': {
          actions: assign(({ context }) => ({
            setupPackImport: {
              ...context.setupPackImport,
              restartBrain: !context.setupPackImport.restartBrain,
            },
          })),
        },
        'SETUP_PACK.CONFIRM_IMPORT': {
          actions: 'confirmSetupPackImport',
        },
        'SETUP_PACK.CANCEL': {
          actions: 'cancelSetupPack',
        },
        'SETUP_PACK.RESET_STATUS': {
          actions: 'resetSetupPackStatus',
        },
        SETUP_PACK_PREVIEW: {
          actions: 'setSetupPackPreview',
        },
        SETUP_PACK_PREVIEW_FAILED: {
          actions: 'setSetupPackPreviewFailed',
        },
        SETUP_PACK_IMPORTED: {
          actions: 'setSetupPackImported',
        },
        SETUP_PACK_IMPORT_FAILED: {
          actions: 'setSetupPackImportFailed',
        },
        'APP.RESET': {
          guard: ({ context }) => !context.resetting,
          actions: [
            assign({ resetting: true }),
            () => {
              trpc.bus.send.mutate({ systemId: id, type: 'RESET_APP' } as any);
            },
          ],
        },
        APP_RESET_COMPLETE: {
          actions: () => {
            if (window.electronAPI?.apiStatus?.relaunch) {
              window.electronAPI.apiStatus.relaunch();
            } else {
              window.location.reload(); // Fallback for dev/browser
            }
          },
        },
        APP_RESET_FAILED: {
          actions: [
            assign({ resetting: false }),
            ({ event }: { event: any }) => {
              window.alert(`Reset failed: ${event.error}`);
            },
          ],
        },
      },
    },
  },
});

export default settingsState;