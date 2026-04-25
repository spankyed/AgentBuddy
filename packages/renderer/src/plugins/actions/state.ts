import { assign, setup, type ActorRefFrom } from 'xstate'
import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb'
import { safeEvents } from '@/core/types/safe-events'
import {
  targetIs,
  TRAIL_CLICK,
  type TrailClickEvent,
} from '@/core/actors/route-trailer'
import type {
  ActionEntity,
  OutgoingActionEvents,
  EARS,
  ActionParameter,
  Category,
  ActionsSettings,
} from '@app/api'
import { trpc } from '@/core/trpc'
import { Trash2 } from 'lucide-vue-next'
import { contextMenuFn } from '@/core/context-menu'

/* ─────────────────────────────────────────────────────────── */
/* Machine Types                                               */
/* ─────────────────────────────────────────────────────────── */
export const id = 'actions'
export type ActionsState = ActorRefFrom<typeof actionsState>

export interface ActionsContext {
  selectedActionId?: EARS.EntityId;
  actions: ActionEntity[];
  selectedAction?: ActionEntity;
  totalCount: number;
  page: number;
  totalPages: number;
  loadingMore: boolean;
  categories: Category[]; // Categories from settings
  selectedCategories: string[]; // Filter state

  // Import/Export state
  actionsImport: {
    status: 'idle' | 'importing' | 'success' | 'error';
    errors: string[];
    importedCount: number;
  };
  actionsExport: {
    status: 'idle' | 'exporting' | 'success' | 'error';
    errors: string[];
    filePath: string;
    actionCount: number;
  };

  // Form data for create/edit
  formData: {
    label: string;
    description?: string;
    category?: string;
    input: Record<string, ActionParameter>;
    actionFn: string;
    output?: any;
    parametersExpanded?: boolean;
    outputExpanded?: boolean;
    metadataExpanded?: boolean;
  };
}

type SystemEvent = OutgoingActionEvents
  | { type: 'ACTIONS_PAGE_LOADED'; data: { actions: ActionEntity[]; page: number; totalPages: number } }
  | { type: 'ACTIONS_IMPORTED'; count: number; errors?: string[] }
  | { type: 'ACTIONS_IMPORT_FAILED'; errors: string[] }
  | { type: 'ACTIONS_EXPORTED'; filePath: string; actionCount: number }
  | { type: 'ACTIONS_EXPORT_FAILED'; errors: string[] }

type UIEvent =
  | { type: 'ACTION.SELECT'; actionId: EARS.EntityId }
  | { type: 'ACTION.CREATE' }
  | { type: 'ACTION.SAVE' }
  | { type: 'ACTION.DELETE'; actionId: EARS.EntityId }
  | { type: 'ACTION.UPDATE_INPUT'; actionId: string; input: Record<string, any> }
  | { type: 'ACTION.CREATE_INLINE'; label: string; actionFn: string; input: Record<string, any> }
  | { type: 'ACTION.UPDATE_LABEL'; actionId: string; label: string }
  | { type: 'FORM.UPDATE_LABEL'; label: string }
  | { type: 'FORM.UPDATE_DESCRIPTION'; description: string }
  | { type: 'FORM.UPDATE_PARAMETERS'; input: Record<string, ActionParameter> }
  | { type: 'FORM.UPDATE_ACTION'; actionFn: string }
  | { type: 'FORM.UPDATE_OUTPUT'; output: any }
  | { type: 'FORM.UPDATE_CATEGORY'; category: string }
  | { type: 'VIEW_LIST' }
  | { type: 'TOGGLE_PARAMETERS_SECTION'; show: boolean }
  | { type: 'TOGGLE_OUTPUT_SECTION'; show: boolean }
  | { type: 'TOGGLE_METADATA_SECTION'; show: boolean }
  | { type: 'ACTIONS_SETTINGS_UPDATED'; settings: ActionsSettings }
  | { type: 'ACTIONS.LOAD_MORE' }
  | { type: 'FILTER.TOGGLE_CATEGORY'; categoryName: string }
  | { type: 'FILTER.CLEAR' }
  // Import/Export events
  | { type: 'ACTIONS.IMPORT'; actions: any[] }
  | { type: 'ACTIONS.RESET_IMPORT_STATUS' }
  | { type: 'ACTIONS.EXPORT'; directory: string }
  | { type: 'ACTIONS.RESET_EXPORT_STATUS' }

export type ActionsEvents = UIEvent | SystemEvent | TrailClickEvent
const typeOf = safeEvents<ActionsEvents>()

const actionsState = setup({
  types: {
    context: {} as ActionsContext,
    events: {} as ActionsEvents,
  },
  actions: {
    /* ── bootstrap ─────────────────────────────────────── */
    setPluginData: assign(({ event }) => {
      const ev = typeOf('ACTIONS_LISTED', event);
      return {
        actions: ev.data.actions,
        totalCount: ev.data.totalCount,
        page: ev.data.page,
        totalPages: ev.data.totalPages,
        categories: ev.data.categories || [],
      }
    }),

    /* ── action interactions ────────────────────────────── */
    selectAction: ({ event, context }) => {
      const ev = typeOf('ACTION.SELECT', event);
      if (context.selectedActionId === ev.actionId) {
        return
      }
      // Send event to backend to get action data
      trpc.bus.send.mutate({
        systemId: id,
        type: 'ACTION_SELECT',
        actionId: ev.actionId,
      });
    },

    loadActionData: assign(({ event }) => {
      const ev = typeOf('ACTION_SELECTED', event);
      return {
        selectedActionId: ev.actionId,
        selectedAction: ev.data,
        formData: {
          label: ev.data.label,
          description: ev.data.description,
          category: ev.data.category,
          input: ev.data.input,
          actionFn: ev.data.actionFn,
          output: ev.data.output,
        },
      };
    }),

    initCreateForm: assign({
      formData: {
        label: '',
        description: '',
        category: '',
        input: {},
        actionFn: '// Your action function body here\n// Available services: logger, database, email, http\nreturn { success: true };',
        output: undefined,
      },
      selectedActionId: undefined,
      selectedAction: undefined,
    }),

    sendSaveAction: ({ context }) => {
      // Determine if creating or updating based on selectedActionId
      const isCreating = !context.selectedActionId;
      
      if (isCreating) {
        // Create new action
        trpc.bus.send.mutate({
          systemId: id,
          type: 'CREATE_ACTION',
          ...context.formData,
        })
      } else {
        // Update existing action
        trpc.bus.send.mutate({
          systemId: id,
          type: 'UPDATE_ACTION',
          actionId: context.selectedActionId!,
          ...context.formData,
        })
      }
    },

    sendDeleteAction: ({ event }) => {
      const ev = typeOf('ACTION.DELETE', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'DELETE_ACTION',
        actionId: ev.actionId,
      });
    },

    updateActionInput: ({ event }) => {
      const ev = typeOf('ACTION.UPDATE_INPUT', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_ACTION',
        actionId: ev.actionId,
        input: ev.input,
      });
    },

    createActionInline: ({ event }) => {
      const ev = typeOf('ACTION.CREATE_INLINE', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'CREATE_ACTION',
        label: ev.label,
        actionFn: ev.actionFn,
        input: ev.input,
      });
    },

    updateActionLabel: ({ event }) => {
      const ev = typeOf('ACTION.UPDATE_LABEL', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_ACTION',
        actionId: ev.actionId,
        label: ev.label,
      });
    },

    addCreatedAction: assign(({ context, event }) => {
      const ev = typeOf('ACTION_CREATED', event);
      return {
        actions: [...context.actions, ev.action],
        selectedActionId: ev.actionId,
        selectedAction: ev.action,
      };
    }),

    updateActionInList: assign(({ context, event }) => {
      const ev = typeOf('ACTION_UPDATED', event);
      return {
        actions: context.actions.map(a => 
          a.id === ev.actionId ? ev.action : a
        ),
        selectedAction: ev.action,
      };
    }),

    removeDeletedAction: assign(({ context, event }) => {
      const ev = typeOf('ACTION_DELETED', event);
      return {
        actions: context.actions.filter(a => a.id !== ev.actionId),
        selectedActionId: undefined,
        selectedAction: undefined,
      };
    }),

    /* ── form updates ────────────────────────────────────── */
    updateFormLabel: assign(({ event, context }) => {
      const ev = typeOf('FORM.UPDATE_LABEL', event);
      return {
        formData: {
          ...context.formData,
          label: ev.label,
        },
      };
    }),

    updateFormDescription: assign(({ event, context }) => {
      const ev = typeOf('FORM.UPDATE_DESCRIPTION', event);
      return {
        formData: {
          ...context.formData,
          description: ev.description,
        },
      };
    }),

    updateFormParameters: assign(({ event, context }) => {
      const ev = typeOf('FORM.UPDATE_PARAMETERS', event);
      return {
        formData: {
          ...context.formData,
          input: ev.input,
        },
      };
    }),

    updateFormAction: assign(({ event, context }) => {
      const ev = typeOf('FORM.UPDATE_ACTION', event);
      return {
        formData: {
          ...context.formData,
          actionFn: ev.actionFn,
        },
      };
    }),

    updateFormOutput: assign(({ event, context }) => {
      const ev = typeOf('FORM.UPDATE_OUTPUT', event);
      return {
        formData: {
          ...context.formData,
          output: ev.output,
        },
      };
    }),

    updateFormCategory: assign(({ event, context }) => {
      const ev = typeOf('FORM.UPDATE_CATEGORY', event);
      return {
        formData: {
          ...context.formData,
          category: ev.category,
        },
      };
    }),
    
    handleSettingsUpdate: assign(({ event }) => {
      const ev = typeOf('ACTIONS_SETTINGS_UPDATED', event);
      return {
        categories: ev.settings?.categories || [],
      };
    }),

    toggleParametersSection: assign(({ event, context }) => {
      const ev = typeOf('TOGGLE_PARAMETERS_SECTION', event);
      return {
        formData: {
          ...context.formData,
          parametersExpanded: ev.show,
        },
      };
    }),

    toggleOutputSection: assign(({ event, context }) => {
      const ev = typeOf('TOGGLE_OUTPUT_SECTION', event);
      return {
        formData: {
          ...context.formData,
          outputExpanded: ev.show,
        },
      };
    }),

    toggleMetadataSection: assign(({ event, context }) => {
      const ev = typeOf('TOGGLE_METADATA_SECTION', event);
      return {
        formData: {
          ...context.formData,
          metadataExpanded: ev.show,
        },
      };
    }),

    /* ── pagination ────────────────────────────────────────── */
    requestNextPage: assign(({ context }) => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'FETCH_ACTIONS_PAGE',
        page: context.page + 1,
      });
      return { loadingMore: true };
    }),

    appendPageData: assign(({ context, event }) => {
      const ev = typeOf('ACTIONS_PAGE_LOADED', event);
      return {
        actions: [...context.actions, ...ev.data.actions],
        page: ev.data.page,
        totalPages: ev.data.totalPages,
        loadingMore: false,
      };
    }),

    /* ── filter actions ──────────────────────────────────── */
    toggleCategoryFilter: assign(({ event, context }) => {
      const ev = typeOf('FILTER.TOGGLE_CATEGORY', event);
      const categoryName = ev.categoryName;
      const isSelected = context.selectedCategories.includes(categoryName);

      return {
        selectedCategories: isSelected
          ? context.selectedCategories.filter(c => c !== categoryName)
          : [...context.selectedCategories, categoryName]
      };
    }),

    clearCategoryFilters: assign({
      selectedCategories: []
    }),

    /* ── Actions Import actions ────────────────────────────── */
    setImportingActions: assign(({ context }) => ({
      actionsImport: {
        ...context.actionsImport,
        status: 'importing' as const,
      },
    })),

    sendImportActions: ({ event }) => {
      const ev = typeOf('ACTIONS.IMPORT', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'IMPORT_ACTIONS',
        actions: ev.actions,
      } as any);
    },

    handleActionsImported: assign(({ event }) => {
      const ev = typeOf('ACTIONS_IMPORTED', event);
      return {
        actionsImport: {
          status: 'success' as const,
          errors: ev.errors || [],
          importedCount: ev.count,
        },
      };
    }),

    handleActionsImportFailed: assign(({ event }) => {
      const ev = typeOf('ACTIONS_IMPORT_FAILED', event);
      return {
        actionsImport: {
          status: 'error' as const,
          errors: ev.errors,
          importedCount: 0,
        },
      };
    }),

    resetImportActionsStatus: assign({
      actionsImport: { status: 'idle' as const, errors: [], importedCount: 0 },
    }),

    /* ── Actions Export actions ────────────────────────────── */
    setExportingActions: assign(({ context }) => ({
      actionsExport: {
        ...context.actionsExport,
        status: 'exporting' as const,
      },
    })),

    sendExportActions: ({ event }) => {
      const ev = typeOf('ACTIONS.EXPORT', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'EXPORT_ACTIONS',
        directory: ev.directory,
      } as any);
    },

    handleActionsExported: assign(({ event }) => {
      const ev = typeOf('ACTIONS_EXPORTED', event);
      return {
        actionsExport: {
          status: 'success' as const,
          errors: [],
          filePath: ev.filePath,
          actionCount: ev.actionCount,
        },
      };
    }),

    handleActionsExportFailed: assign(({ event }) => {
      const ev = typeOf('ACTIONS_EXPORT_FAILED', event);
      return {
        actionsExport: {
          status: 'error' as const,
          errors: ev.errors,
          filePath: '',
          actionCount: 0,
        },
      };
    }),

    resetExportActionsStatus: assign({
      actionsExport: { status: 'idle' as const, errors: [], filePath: '', actionCount: 0 },
    }),
  },
  guards: { targetIs },
}).createMachine({
  id,
  initial: 'list',
  context: {
    selectedActionId: undefined,
    actions: [],
    selectedAction: undefined,
    totalCount: 0,
    page: 1,
    totalPages: 1,
    loadingMore: false,
    categories: [], // Will be populated from settings
    selectedCategories: [], // Filter state
    actionsImport: {
      status: 'idle',
      errors: [],
      importedCount: 0,
    },
    actionsExport: {
      status: 'idle',
      errors: [],
      filePath: '',
      actionCount: 0,
    },
    formData: {
      label: '',
      description: '',
      category: '',
      input: {},
      actionFn: '',
      output: undefined,
    },
  },
  on: {
    ACTIONS_LISTED: { actions: 'setPluginData' },
    ACTION_SELECTED: { actions: 'loadActionData' },
    ACTIONS_SETTINGS_UPDATED: { actions: 'handleSettingsUpdate' },
    ACTION_CREATED: {
      actions: 'addCreatedAction'
    },
    ACTION_UPDATED: {
      actions: 'updateActionInList'
    },
    ACTION_DELETED: {
      actions: 'removeDeletedAction',
      target: '.list'
    },
    VIEW_LIST: {
      target: '.list'
    },
    TOGGLE_PARAMETERS_SECTION: { actions: 'toggleParametersSection' },
    TOGGLE_OUTPUT_SECTION: { actions: 'toggleOutputSection' },
    TOGGLE_METADATA_SECTION: { actions: 'toggleMetadataSection' },
    'ACTIONS.LOAD_MORE': { actions: 'requestNextPage' },
    ACTIONS_PAGE_LOADED: { actions: 'appendPageData' },
    'FILTER.TOGGLE_CATEGORY': { actions: 'toggleCategoryFilter' },
    'FILTER.CLEAR': { actions: 'clearCategoryFilters' },
    // Import events
    'ACTIONS.IMPORT': {
      actions: ['setImportingActions', 'sendImportActions'],
    },
    'ACTIONS.RESET_IMPORT_STATUS': {
      actions: 'resetImportActionsStatus',
    },
    ACTIONS_IMPORTED: {
      actions: 'handleActionsImported',
    },
    ACTIONS_IMPORT_FAILED: {
      actions: 'handleActionsImportFailed',
    },
    // Export events
    'ACTIONS.EXPORT': {
      actions: ['setExportingActions', 'sendExportActions'],
    },
    'ACTIONS.RESET_EXPORT_STATUS': {
      actions: 'resetExportActionsStatus',
    },
    ACTIONS_EXPORTED: {
      actions: 'handleActionsExported',
    },
    ACTIONS_EXPORT_FAILED: {
      actions: 'handleActionsExportFailed',
    },
    'ACTION.UPDATE_INPUT': { actions: 'updateActionInput' },
    'ACTION.CREATE_INLINE': { actions: 'createActionInline' },
    'ACTION.UPDATE_LABEL': { actions: 'updateActionLabel' },
    ...TRAIL_CLICK([
      ['.list', 'list'],
      ['.create', 'create'],
      ['.detail', 'detail'],
    ]),
  },
  states: {
    list: {
      tags: ['list-actions'],
      meta: { ...breadcrumb('list', 'Actions', true) },
      on: {
        'ACTION.SELECT': {
          actions: 'selectAction',
          target: 'detail',
        },
        'ACTION.CREATE': {
          actions: 'initCreateForm',
          target: 'create',
        },
        'ACTION.DELETE': {
          actions: 'sendDeleteAction',
        },
      }
    },
    create: {
      tags: ['create-action'],
      meta: { ...breadcrumb('create', 'New Action') },
      on: {
        'FORM.UPDATE_LABEL': { actions: 'updateFormLabel' },
        'FORM.UPDATE_DESCRIPTION': { actions: 'updateFormDescription' },
        'FORM.UPDATE_PARAMETERS': { actions: 'updateFormParameters' },
        'FORM.UPDATE_ACTION': { actions: 'updateFormAction' },
        'FORM.UPDATE_OUTPUT': { actions: 'updateFormOutput' },
        'FORM.UPDATE_CATEGORY': { actions: 'updateFormCategory' },
        'ACTION.SAVE': {
          actions: 'sendSaveAction',
          target: 'list',
        },
      },
    },
    detail: {
      tags: ['detail-action'],
      meta: {
        ...breadcrumbWithParams<ActionsContext>({
          target: 'detail',
          getLabel: (ctx) => {
            return ctx.selectedAction?.label || ctx.selectedActionId || '';
          }
        }),
        ...contextMenuFn<ActionsContext>((ctx) => [
          { label: 'Delete Action', icon: Trash2, event: { type: 'ACTION.DELETE' as const, actionId: ctx.selectedActionId! }, iconColor: 'text-red-400', confirm: 'Are you sure you want to delete this action?' },
        ]),
      },
      on: {
        'FORM.UPDATE_LABEL': { actions: 'updateFormLabel' },
        'FORM.UPDATE_DESCRIPTION': { actions: 'updateFormDescription' },
        'FORM.UPDATE_PARAMETERS': { actions: 'updateFormParameters' },
        'FORM.UPDATE_ACTION': { actions: 'updateFormAction' },
        'FORM.UPDATE_OUTPUT': { actions: 'updateFormOutput' },
        'FORM.UPDATE_CATEGORY': { actions: 'updateFormCategory' },
        'ACTION.SAVE': {
          actions: 'sendSaveAction',
          target: 'list',
        },
        'ACTION.DELETE': {
          actions: 'sendDeleteAction',
        },
      },
    },
  },
})

export default actionsState