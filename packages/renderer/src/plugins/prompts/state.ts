import { assign, setup, type ActorRefFrom } from 'xstate'
import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb'
import { safeEvents } from '@/core/types/safe-events'
import {
  targetIs,
  TRAIL_CLICK,
  type TrailClickEvent,
} from '@/core/actors/route-trailer'
import type {
  PromptEntity,
  OutgoingPromptEvents,
  EARS,
  TemplateInput,
  Category,
  PromptsSettings,
} from '@app/api'
import { trpc } from '@/core/trpc'

/* ─────────────────────────────────────────────────────────── */
/* Machine Types                                               */
/* ─────────────────────────────────────────────────────────── */
export const id = 'prompts'
export type PromptsState = ActorRefFrom<typeof promptsState>

export interface PromptsContext {
  selectedPromptId?: EARS.EntityId;
  prompts: PromptEntity[];
  selectedPrompt?: PromptEntity;
  totalCount: number;
  categories: Category[]; // Categories from settings
  selectedCategories: string[]; // Filter state

  // Import/Export state
  promptsImport: {
    status: 'idle' | 'importing' | 'success' | 'error';
    errors: string[];
    importedCount: number;
  };
  promptsExport: {
    status: 'idle' | 'exporting' | 'success' | 'error';
    errors: string[];
    filePath: string;
    promptCount: number;
  };

  // Form data for create/edit
  formData: {
    label: string;
    description?: string;
    category?: string;
    inputs: Record<string, TemplateInput>;
    templateFn: string;
    outputSchema?: any;
    inputsExpanded?: boolean;
    outputExpanded?: boolean;
    metadataExpanded?: boolean;
  };
}

type SystemEvent = OutgoingPromptEvents
  | { type: 'PROMPTS_IMPORTED'; count: number; errors?: string[] }
  | { type: 'PROMPTS_IMPORT_FAILED'; errors: string[] }
  | { type: 'PROMPTS_EXPORTED'; filePath: string; promptCount: number }
  | { type: 'PROMPTS_EXPORT_FAILED'; errors: string[] }

type UIEvent =
  | { type: 'PROMPT.SELECT'; promptId: EARS.EntityId }
  | { type: 'PROMPT.CREATE' }
  | { type: 'PROMPT.SAVE' }
  | { type: 'PROMPT.DELETE'; promptId: EARS.EntityId }
  | { type: 'PROMPT.UPDATE_INPUTS'; promptId: string; inputs: Record<string, any> }
  | { type: 'PROMPT.CREATE_INLINE'; label: string; templateFn: string; inputs: Record<string, any> }
  | { type: 'PROMPT.UPDATE_LABEL'; promptId: string; label: string }
  | { type: 'FORM.UPDATE_CATEGORY'; category: string }
  | { type: 'FORM.UPDATE_LABEL'; label: string }
  | { type: 'FORM.UPDATE_DESCRIPTION'; description: string }
  | { type: 'FORM.UPDATE_INPUTS'; inputs: Record<string, TemplateInput> }
  | { type: 'FORM.UPDATE_TEMPLATE'; templateFn: string }
  | { type: 'FORM.UPDATE_OUTPUT_SCHEMA'; outputSchema: any }
  | { type: 'VIEW_LIST' }
  | { type: 'TOGGLE_INPUTS_SECTION'; show: boolean }
  | { type: 'TOGGLE_OUTPUT_SECTION'; show: boolean }
  | { type: 'TOGGLE_METADATA_SECTION'; show: boolean }
  | { type: 'PROMPTS_SETTINGS_UPDATED'; settings: PromptsSettings }
  | { type: 'FILTER.TOGGLE_CATEGORY'; categoryName: string }
  | { type: 'FILTER.CLEAR' }
  // Import/Export events
  | { type: 'PROMPTS.IMPORT'; prompts: any[] }
  | { type: 'PROMPTS.RESET_IMPORT_STATUS' }
  | { type: 'PROMPTS.EXPORT'; directory: string }
  | { type: 'PROMPTS.RESET_EXPORT_STATUS' }

export type PromptsEvents = UIEvent | SystemEvent | TrailClickEvent
const typeOf = safeEvents<PromptsEvents>()

const promptsState = setup({
  types: {
    context: {} as PromptsContext,
    events: {} as PromptsEvents,
  },
  actions: {
    /* ── bootstrap ─────────────────────────────────────── */
    setPluginData: assign(({ event }) => {
      const ev = typeOf('PROMPTS_CONNECTED', event);
      return {
        prompts: ev.data.prompts,
        totalCount: ev.data.totalCount,
        categories: ev.data.categories || [],
      }
    }),

    /* ── prompt interactions ────────────────────────────── */
    selectPrompt: ({ event, context }) => {
      const ev = typeOf('PROMPT.SELECT', event);
      if (context.selectedPromptId === ev.promptId) {
        return
      }
      // Send event to backend to get prompt data
      trpc.bus.send.mutate({
        systemId: id,
        type: 'PROMPT_SELECT',
        promptId: ev.promptId,
      });
    },

    loadPromptData: assign(({ event }) => {
      const ev = typeOf('PROMPT_SELECTED', event);
      return {
        selectedPromptId: ev.promptId,
        selectedPrompt: ev.data,
        formData: {
          label: ev.data.label,
          description: ev.data.description,
          category: ev.data.category,
          inputs: ev.data.inputs,
          templateFn: ev.data.templateFn,
          outputSchema: ev.data.outputSchema,
        },
      };
    }),

    initCreateForm: assign({
      formData: {
        label: '',
        description: '',
        category: '',
        inputs: {},
        templateFn: '// Your template function body here\nreturn `Your prompt template`;',
        outputSchema: undefined,
      },
      selectedPromptId: undefined,
      selectedPrompt: undefined,
    }),

    sendSavePrompt: ({ context }) => {
      // Determine if creating or updating based on selectedPromptId
      const isCreating = !context.selectedPromptId;
      
      if (isCreating) {
        // Create new prompt
        trpc.bus.send.mutate({
          systemId: id,
          type: 'CREATE_PROMPT',
          ...context.formData,
        })
      } else {
        // Update existing prompt
        trpc.bus.send.mutate({
          systemId: id,
          type: 'UPDATE_PROMPT',
          promptId: context.selectedPromptId!,
          ...context.formData,
        })
      }
    },

    sendDeletePrompt: ({ event }) => {
      const ev = typeOf('PROMPT.DELETE', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'DELETE_PROMPT',
        promptId: ev.promptId,
      });
    },

    updatePromptInputs: ({ event }) => {
      const ev = typeOf('PROMPT.UPDATE_INPUTS', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_PROMPT',
        promptId: ev.promptId,
        inputs: ev.inputs,
      });
    },

    createPromptInline: ({ event }) => {
      const ev = typeOf('PROMPT.CREATE_INLINE', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'CREATE_PROMPT',
        label: ev.label,
        templateFn: ev.templateFn,
        inputs: ev.inputs,
      });
    },

    updatePromptLabel: ({ event }) => {
      const ev = typeOf('PROMPT.UPDATE_LABEL', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_PROMPT',
        promptId: ev.promptId,
        label: ev.label,
      });
    },

    addCreatedPrompt: assign(({ context, event }) => {
      const ev = typeOf('PROMPT_CREATED', event);
      return {
        prompts: [...context.prompts, ev.prompt],
        selectedPromptId: ev.promptId,
        selectedPrompt: ev.prompt,
      };
    }),

    updatePromptInList: assign(({ context, event }) => {
      const ev = typeOf('PROMPT_UPDATED', event);
      return {
        prompts: context.prompts.map(p => 
          p.id === ev.promptId ? ev.prompt : p
        ),
        selectedPrompt: ev.prompt,
      };
    }),

    removeDeletedPrompt: assign(({ context, event }) => {
      const ev = typeOf('PROMPT_DELETED', event);
      return {
        prompts: context.prompts.filter(p => p.id !== ev.promptId),
        selectedPromptId: undefined,
        selectedPrompt: undefined,
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

    updateFormInputs: assign(({ event, context }) => {
      const ev = typeOf('FORM.UPDATE_INPUTS', event);
      return {
        formData: {
          ...context.formData,
          inputs: ev.inputs,
        },
      };
    }),

    updateFormTemplate: assign(({ event, context }) => {
      const ev = typeOf('FORM.UPDATE_TEMPLATE', event);
      return {
        formData: {
          ...context.formData,
          templateFn: ev.templateFn,
        },
      };
    }),

    updateFormOutputSchema: assign(({ event, context }) => {
      const ev = typeOf('FORM.UPDATE_OUTPUT_SCHEMA', event);
      return {
        formData: {
          ...context.formData,
          outputSchema: ev.outputSchema,
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
      const ev = typeOf('PROMPTS_SETTINGS_UPDATED', event);
      return {
        categories: ev.settings?.categories || [],
      };
    }),

    toggleInputsSection: assign(({ event, context }) => {
      const ev = typeOf('TOGGLE_INPUTS_SECTION', event);
      return {
        formData: {
          ...context.formData,
          inputsExpanded: ev.show,
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

    /* ── Prompts Import actions ────────────────────────────── */
    setImportingPrompts: assign(({ context }) => ({
      promptsImport: {
        ...context.promptsImport,
        status: 'importing' as const,
      },
    })),

    sendImportPrompts: ({ event }) => {
      const ev = typeOf('PROMPTS.IMPORT', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'IMPORT_PROMPTS',
        prompts: ev.prompts,
      } as any);
    },

    handlePromptsImported: assign(({ event }) => {
      const ev = typeOf('PROMPTS_IMPORTED', event);
      return {
        promptsImport: {
          status: 'success' as const,
          errors: ev.errors || [],
          importedCount: ev.count,
        },
      };
    }),

    handlePromptsImportFailed: assign(({ event }) => {
      const ev = typeOf('PROMPTS_IMPORT_FAILED', event);
      return {
        promptsImport: {
          status: 'error' as const,
          errors: ev.errors,
          importedCount: 0,
        },
      };
    }),

    resetImportPromptsStatus: assign({
      promptsImport: { status: 'idle' as const, errors: [], importedCount: 0 },
    }),

    /* ── Prompts Export actions ────────────────────────────── */
    setExportingPrompts: assign(({ context }) => ({
      promptsExport: {
        ...context.promptsExport,
        status: 'exporting' as const,
      },
    })),

    sendExportPrompts: ({ event }) => {
      const ev = typeOf('PROMPTS.EXPORT', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'EXPORT_PROMPTS',
        directory: ev.directory,
      } as any);
    },

    handlePromptsExported: assign(({ event }) => {
      const ev = typeOf('PROMPTS_EXPORTED', event);
      return {
        promptsExport: {
          status: 'success' as const,
          errors: [],
          filePath: ev.filePath,
          promptCount: ev.promptCount,
        },
      };
    }),

    handlePromptsExportFailed: assign(({ event }) => {
      const ev = typeOf('PROMPTS_EXPORT_FAILED', event);
      return {
        promptsExport: {
          status: 'error' as const,
          errors: ev.errors,
          filePath: '',
          promptCount: 0,
        },
      };
    }),

    resetExportPromptsStatus: assign({
      promptsExport: { status: 'idle' as const, errors: [], filePath: '', promptCount: 0 },
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
  },
  guards: { targetIs },
}).createMachine({
  id,
  initial: 'list',
  context: {
    selectedPromptId: undefined,
    prompts: [],
    selectedPrompt: undefined,
    totalCount: 0,
    categories: [], // Will be populated from settings
    selectedCategories: [], // Filter state
    promptsImport: {
      status: 'idle',
      errors: [],
      importedCount: 0,
    },
    promptsExport: {
      status: 'idle',
      errors: [],
      filePath: '',
      promptCount: 0,
    },
    formData: {
      label: '',
      description: '',
      category: '',
      inputs: {},
      templateFn: '',
      outputSchema: undefined,
    },
  },
  on: {
    'VIEW_LIST': {
      target: '.list',
    },
    PROMPTS_CONNECTED: { actions: 'setPluginData' },
    PROMPT_SELECTED: { actions: 'loadPromptData' },
    PROMPTS_SETTINGS_UPDATED: { actions: 'handleSettingsUpdate' },
    PROMPT_CREATED: {
      actions: 'addCreatedPrompt'
    },
    PROMPT_UPDATED: {
      actions: 'updatePromptInList'
    },
    PROMPT_DELETED: {
      actions: 'removeDeletedPrompt',
      target: '.list'
    },
    TOGGLE_INPUTS_SECTION: { actions: 'toggleInputsSection' },
    TOGGLE_OUTPUT_SECTION: { actions: 'toggleOutputSection' },
    TOGGLE_METADATA_SECTION: { actions: 'toggleMetadataSection' },
    'FILTER.TOGGLE_CATEGORY': { actions: 'toggleCategoryFilter' },
    'FILTER.CLEAR': { actions: 'clearCategoryFilters' },
    // Import events
    'PROMPTS.IMPORT': {
      actions: ['setImportingPrompts', 'sendImportPrompts'],
    },
    'PROMPTS.RESET_IMPORT_STATUS': {
      actions: 'resetImportPromptsStatus',
    },
    PROMPTS_IMPORTED: {
      actions: 'handlePromptsImported',
    },
    PROMPTS_IMPORT_FAILED: {
      actions: 'handlePromptsImportFailed',
    },
    // Export events
    'PROMPTS.EXPORT': {
      actions: ['setExportingPrompts', 'sendExportPrompts'],
    },
    'PROMPTS.RESET_EXPORT_STATUS': {
      actions: 'resetExportPromptsStatus',
    },
    PROMPTS_EXPORTED: {
      actions: 'handlePromptsExported',
    },
    PROMPTS_EXPORT_FAILED: {
      actions: 'handlePromptsExportFailed',
    },
    'PROMPT.UPDATE_INPUTS': { actions: 'updatePromptInputs' },
    'PROMPT.CREATE_INLINE': { actions: 'createPromptInline' },
    'PROMPT.UPDATE_LABEL': { actions: 'updatePromptLabel' },
    ...TRAIL_CLICK([
      ['.list', 'list'],
      ['.create', 'create'],
      ['.detail', 'detail'],
    ]),
  },
  states: {
    list: {
      tags: ['list-prompts'],
      meta: { ...breadcrumb('list', 'Prompts', true) },
      on: {
        'PROMPT.SELECT': {
          actions: 'selectPrompt',
          target: 'detail',
        },
        'PROMPT.CREATE': {
          actions: 'initCreateForm',
          target: 'create',
        },
        'PROMPT.DELETE': {
          actions: 'sendDeletePrompt',
        },
      }
    },
    create: {
      tags: ['create-prompt'],
      meta: { ...breadcrumb('create', 'New Prompt') },
      on: {
        'FORM.UPDATE_LABEL': { actions: 'updateFormLabel' },
        'FORM.UPDATE_DESCRIPTION': { actions: 'updateFormDescription' },
        'FORM.UPDATE_INPUTS': { actions: 'updateFormInputs' },
        'FORM.UPDATE_TEMPLATE': { actions: 'updateFormTemplate' },
        'FORM.UPDATE_OUTPUT_SCHEMA': { actions: 'updateFormOutputSchema' },
        'FORM.UPDATE_CATEGORY': { actions: 'updateFormCategory' },
        'PROMPT.SAVE': {
          actions: 'sendSavePrompt',
          target: 'list',
        },
      },
    },
    detail: {
      tags: ['detail-prompt'],
      meta: {
        ...breadcrumbWithParams<PromptsContext>({
          target: 'detail',
          getLabel: (ctx) => {
            return ctx.selectedPrompt?.label || ctx.selectedPromptId || '';
          }
        })
      },
      on: {
        'FORM.UPDATE_LABEL': { actions: 'updateFormLabel' },
        'FORM.UPDATE_DESCRIPTION': { actions: 'updateFormDescription' },
        'FORM.UPDATE_INPUTS': { actions: 'updateFormInputs' },
        'FORM.UPDATE_TEMPLATE': { actions: 'updateFormTemplate' },
        'FORM.UPDATE_OUTPUT_SCHEMA': { actions: 'updateFormOutputSchema' },
        'FORM.UPDATE_CATEGORY': { actions: 'updateFormCategory' },
        'PROMPT.SAVE': {
          actions: 'sendSavePrompt',
          target: 'list',
        },
      },
    },
  },
})

export default promptsState 