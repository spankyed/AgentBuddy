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
} from '@abuddy/api'
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
  page: number;
  totalPages: number;
  totalCount: number;
  
  // Form data for create/edit
  formData: {
    label: string;
    description?: string;
    inputs: Record<string, TemplateInput>;
    templateFn: string;
    outputSchema?: any;
  };
}

type SystemEvent = OutgoingPromptEvents

type UIEvent =
  | { type: 'PROMPT.SELECT'; promptId: EARS.EntityId }
  | { type: 'PROMPT.CREATE' }
  | { type: 'PROMPT.SAVE_NEW' }
  | { type: 'PROMPT.UPDATE' }
  | { type: 'PROMPT.DELETE'; promptId: EARS.EntityId }
  | { type: 'PROMPT.EDIT'; promptId: EARS.EntityId }
  | { type: 'PAGE.CHANGE'; page: number }
  | { type: 'FORM.UPDATE_LABEL'; label: string }
  | { type: 'FORM.UPDATE_DESCRIPTION'; description: string }
  | { type: 'FORM.UPDATE_INPUTS'; inputs: Record<string, TemplateInput> }
  | { type: 'FORM.UPDATE_TEMPLATE'; templateFn: string }
  | { type: 'FORM.UPDATE_OUTPUT_SCHEMA'; outputSchema: any }
  | { type: 'GO.BACK' }

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
      const ev = typeOf('PROMPTS_STARTUP', event);
      return {
        prompts: ev.data.prompts,
        page: ev.data.page,
        totalPages: ev.data.totalPages,
        totalCount: ev.data.totalCount,
      }
    }),

    /* ── prompt interactions ────────────────────────────── */
    selectPrompt: ({ event, context }) => {
      const ev = typeOf(['PROMPT.SELECT', 'PROMPT.EDIT'], event);
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
        inputs: {},
        templateFn: '// Your template function body here\nreturn `Your prompt template`;',
        outputSchema: undefined,
      },
      selectedPromptId: undefined,
      selectedPrompt: undefined,
    }),

    sendCreatePrompt: ({ context }) => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'CREATE_PROMPT',
        ...context.formData,
      });
    },

    sendUpdatePrompt: ({ context }) => {
      if (!context.selectedPromptId) return;
      
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_PROMPT',
        promptId: context.selectedPromptId,
        ...context.formData,
      });
    },

    sendDeletePrompt: ({ event }) => {
      const ev = typeOf('PROMPT.DELETE', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'DELETE_PROMPT',
        promptId: ev.promptId,
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
  },
  guards: { targetIs },
}).createMachine({
  id,
  initial: 'list',
  context: {
    selectedPromptId: undefined,
    prompts: [],
    selectedPrompt: undefined,
    page: 1,
    totalPages: 1,
    totalCount: 0,
    formData: {
      label: '',
      description: '',
      inputs: {},
      templateFn: '',
      outputSchema: undefined,
    },
  },
  on: {
    PROMPTS_STARTUP: { actions: 'setPluginData' },
    PROMPT_SELECTED: { actions: 'loadPromptData' },
    PROMPT_CREATED: { 
      actions: 'addCreatedPrompt',
      target: '.view'
    },
    PROMPT_UPDATED: { 
      actions: 'updatePromptInList'
    },
    PROMPT_DELETED: { 
      actions: 'removeDeletedPrompt',
      target: '.list'
    },
    ...TRAIL_CLICK([
      ['.list', 'list'],
      ['.create', 'create'],
      ['.view', 'view'],
      ['.edit', 'edit'],
    ]),
  },
  states: {
    list: {
      tags: ['list-prompts'],
      meta: { ...breadcrumb('list', 'Prompts', true) },
      on: {
        'PROMPT.SELECT': {
          actions: 'selectPrompt',
          target: 'view',
        },
        'PROMPT.CREATE': {
          actions: 'initCreateForm',
          target: 'create',
        },
        'PROMPT.EDIT': {
          actions: 'selectPrompt',
          target: 'edit',
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
        'PROMPT.SAVE_NEW': {
          actions: 'sendCreatePrompt',
        },
        'GO.BACK': {
          target: 'list',
        },
      },
    },
    view: {
      tags: ['view-prompt'],
      meta: {
        ...breadcrumbWithParams<PromptsContext>({
          target: 'view',
          getLabel: (ctx) => {
            return ctx.selectedPrompt?.label || ctx.selectedPromptId || '';
          }
        })
      },
      on: {
        'PROMPT.EDIT': {
          target: 'edit',
        },
        'GO.BACK': {
          target: 'list',
        },
      },
    },
    edit: {
      tags: ['edit-prompt'],
      meta: {
        ...breadcrumbWithParams<PromptsContext>({
          target: 'edit',
          getLabel: (ctx) => {
            return `Edit: ${ctx.selectedPrompt?.label || ctx.selectedPromptId || ''}`;
          }
        })
      },
      on: {
        'FORM.UPDATE_LABEL': { actions: 'updateFormLabel' },
        'FORM.UPDATE_DESCRIPTION': { actions: 'updateFormDescription' },
        'FORM.UPDATE_INPUTS': { actions: 'updateFormInputs' },
        'FORM.UPDATE_TEMPLATE': { actions: 'updateFormTemplate' },
        'FORM.UPDATE_OUTPUT_SCHEMA': { actions: 'updateFormOutputSchema' },
        'PROMPT.UPDATE': {
          actions: 'sendUpdatePrompt',
          target: 'view',
        },
        'GO.BACK': {
          target: 'view',
        },
      },
    },
  },
})

export default promptsState 