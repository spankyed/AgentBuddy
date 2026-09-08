import { assign, setup, type ActorRefFrom } from 'xstate'
import breadcrumb, { breadcrumbWithParams } from '@abuddy/sdk/fe'
import { safeEvents } from '@abuddy/sdk/fe'
import {
  targetIs,
  TRAIL_CLICK,
  type TrailClickEvent,
} from '@abuddy/sdk/fe'
import type { EARS, OutgoingSettingsEvents, SettingsData, GeneralSettings, PersonalInfo, Secrets, ApplicationHotkeys, PluginSettings, PackSeedsPreview, PackSeedType, FAQItem } from '@/__generated__/types'
import { trpc } from '@abuddy/sdk/rpc'

/* ─────────────────────────────────────────────────────────── */
/* Machine Types                                               */
/* ─────────────────────────────────────────────────────────── */
export const id = 'settings'
export type SettingsState = ActorRefFrom<typeof settingsState>

// Use backend types directly

export type ImportMode = 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace';

export interface PackSeedsImport {
  status: 'idle' | 'previewing' | 'selecting' | 'importing' | 'success' | 'error';
  directory: string | null;
  preview: PackSeedsPreview | null;
  /** Per-type selection: array of keys currently ticked. */
  selection: Record<PackSeedType, string[]>;
  /** Which type rows are currently expanded in the UI. */
  expanded: Record<PackSeedType, boolean>;
  importMode: ImportMode;
  restartBrain: boolean;
  result: any | null;
  error: string | null;
}

// Read-only templates. Consumers must use `freshPackSeeds()` (or spread)
// so the module-level defaults stay pristine.
const EMPTY_SELECTION: Record<PackSeedType, string[]> = {
  actions: [], prompts: [], flows: [], library: [], notes: [], settings: [],
};
const COLLAPSED: Record<PackSeedType, boolean> = {
  actions: false, prompts: false, flows: false, library: false, notes: false, settings: false,
};

function freshPackSeeds(): PackSeedsImport {
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
  packSeedsImport: PackSeedsImport;
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
  | { type: 'PACK_SEEDS.PREVIEW'; directory: string }
  | { type: 'PACK_SEEDS.TOGGLE_EXPAND'; key: PackSeedType }
  | { type: 'PACK_SEEDS.TOGGLE_TYPE_ALL'; key: PackSeedType }
  | { type: 'PACK_SEEDS.TOGGLE_ITEM'; key: PackSeedType; item: string }
  | { type: 'PACK_SEEDS.SET_MODE'; mode: 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace' }
  | { type: 'PACK_SEEDS.TOGGLE_RESTART_BRAIN' }
  | { type: 'PACK_SEEDS.CONFIRM_IMPORT' }
  | { type: 'PACK_SEEDS.CANCEL' }
  | { type: 'PACK_SEEDS.RESET_STATUS' }
  | { type: 'APP.RESET' }

export type SettingsEvents = UIEvent | OutgoingSettingsEvents | TrailClickEvent
  | { type: 'PACK_SEEDS_IMPORTED'; result: any }
  | { type: 'PACK_SEEDS_IMPORT_FAILED'; error: string }
  | { type: 'PACK_SEEDS_PREVIEW'; preview: PackSeedsPreview }
  | { type: 'PACK_SEEDS_PREVIEW_FAILED'; error: string }
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

    setSettingsData: assign(({ context, event, self }) => {
      const ev = typeOf('SETTINGS_LOADED', event);
      const result: Record<string, any> = {
        settings: ev.data,
        faqs: ev.faqs ?? [],
        isLoading: false,
      };
      if (!context.selectedPluginId) {
        const appPlugins = self.system.get('application')?.getSnapshot()?.context?.plugins ?? [];
        const withSettings = appPlugins.filter((p: any) => p.settings);
        if (withSettings.length > 0) result.selectedPluginId = withSettings[0].id;
      }
      return result;
    }),

    notifyPluginVisibility: ({ event, system }) => {
      const data = (event as any).data;
      if (data?.plugins?._meta?.visibility) {
        system.get('application')?.send({
          type: 'PLUGIN_VISIBILITY_UPDATED',
          pluginVisibility: data.plugins._meta.visibility,
        });
      }
    },

    setSecretsData: assign(({ event }) => {
      const ev = event as { type: 'SECRETS.EVENT.LOADED'; data: any[] };
      return {
        secretsData: ev.data
      };
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

    previewPackSeeds: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_SEEDS.PREVIEW'; directory: string };
      trpc.bus.send.mutate({
        systemId: id,
        type: 'PREVIEW_PACK_SEEDS',
        directory: ev.directory,
      } as any);
      return {
        packSeedsImport: {
          ...context.packSeedsImport,
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

    setPackSeedsPreview: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_SEEDS_PREVIEW'; preview: PackSeedsPreview };
      const selection: Record<PackSeedType, string[]> = {
        actions: (ev.preview.seeds.actions ?? []).map(i => i.key),
        prompts: (ev.preview.seeds.prompts ?? []).map(i => i.key),
        flows: (ev.preview.seeds.flows ?? []).map(i => i.key),
        library: (ev.preview.seeds.library ?? []).map(i => i.key),
        notes: (ev.preview.seeds.notes ?? []).map(i => i.key),
        settings: (ev.preview.seeds.settings ?? []).map(i => i.key),
      };
      return {
        packSeedsImport: {
          ...context.packSeedsImport,
          status: 'selecting' as const,
          preview: ev.preview,
          selection,
          expanded: { ...COLLAPSED },
          result: null,
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
          error: ev.error,
        },
      };
    }),

    togglePackSeedsExpand: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_SEEDS.TOGGLE_EXPAND'; key: PackSeedType };
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
      const ev = event as { type: 'PACK_SEEDS.TOGGLE_TYPE_ALL'; key: PackSeedType };
      const preview = context.packSeedsImport.preview;
      if (!preview) return {};
      const currentlySelected = context.packSeedsImport.selection[ev.key];
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
      const ev = event as { type: 'PACK_SEEDS.TOGGLE_ITEM'; key: PackSeedType; item: string };
      const current = context.packSeedsImport.selection[ev.key];
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

      // null = import all items of this type, [] = skip, string[] = filter.
      // A zero-total type (missing from the pack, or simply empty) should be
      // skipped — not treated as "import everything".
      const toIncludeField = (key: PackSeedType): string[] | null => {
        const selected = selection[key];
        const total = (preview.seeds[key] ?? []).length;
        if (total === 0) return [];
        return selected.length === total ? null : selected;
      };

      trpc.bus.send.mutate({
        systemId: id,
        type: 'IMPORT_PACK_SEEDS',
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
        packSeedsImport: {
          ...context.packSeedsImport,
          status: 'importing' as const,
          result: null,
          error: null,
        },
      };
    }),

    cancelPackSeeds: assign(() => ({
      packSeedsImport: freshPackSeeds(),
    })),

    setPackSeedsImported: assign(({ context, event }) => {
      const ev = event as { type: 'PACK_SEEDS_IMPORTED'; result: any };
      return {
        packSeedsImport: {
          ...context.packSeedsImport,
          status: 'success' as const,
          result: ev.result,
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
    faqs: [],
    secretsData: [],
    cliTestResults: {},
    packSeedsImport: freshPackSeeds(),
    activeTab: 'general',
    generalNavItem: 'application',
    selectedPluginId: null as string | null,
    isLoading: true,
    resetting: false,
  }),
  states: {
    loading: {
      entry: 'loadSettings',
      on: {
        SETTINGS_LOADED: {
          target: 'ready',
          actions: ['setSettingsData', 'notifyPluginVisibility'],
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
          actions: ['updateSettingsData', 'notifyPluginVisibility'],
        },
        SETTINGS_RESET: {
          actions: ['updateSettingsData', 'notifyPluginVisibility'],
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