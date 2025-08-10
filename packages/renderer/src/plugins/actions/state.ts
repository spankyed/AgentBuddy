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
} from '@app/api'
import { trpc } from '@/core/trpc'

/* ─────────────────────────────────────────────────────────── */
/* Machine Types                                               */
/* ─────────────────────────────────────────────────────────── */
export const id = 'actions'
export type ActionsState = ActorRefFrom<typeof actionsState>

export interface ActionsContext {
  selectedActionId?: EARS.EntityId;
  actions: ActionEntity[];
  selectedAction?: ActionEntity;
  page: number;
  totalPages: number;
  totalCount: number;
  
  // Form data for create/edit
  formData: {
    label: string;
    description?: string;
    category?: string;
    input: Record<string, ActionParameter>;
    actionFn: string;
    output?: any;
  };
}

type SystemEvent = OutgoingActionEvents

type UIEvent =
  | { type: 'ACTION.SELECT'; actionId: EARS.EntityId }
  | { type: 'ACTION.CREATE' }
  | { type: 'ACTION.SAVE_NEW' }
  | { type: 'ACTION.UPDATE' }
  | { type: 'ACTION.DELETE'; actionId: EARS.EntityId }
  | { type: 'PAGE.CHANGE'; page: number }
  | { type: 'FORM.UPDATE_LABEL'; label: string }
  | { type: 'FORM.UPDATE_DESCRIPTION'; description: string }
  | { type: 'FORM.UPDATE_PARAMETERS'; input: Record<string, ActionParameter> }
  | { type: 'FORM.UPDATE_ACTION'; actionFn: string }
  | { type: 'FORM.UPDATE_OUTPUT'; output: any }
  | { type: 'FORM.UPDATE_CATEGORY'; category: string }
  | { type: 'GO.BACK' }

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
        page: ev.data.page,
        totalPages: ev.data.totalPages,
        totalCount: ev.data.totalCount,
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

    sendCreateAction: ({ context }) => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'CREATE_ACTION',
        ...context.formData,
      });
    },

    sendUpdateAction: ({ context }) => {
      if (!context.selectedActionId) return;
      
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_ACTION',
        actionId: context.selectedActionId,
        ...context.formData,
      });
    },

    sendDeleteAction: ({ event }) => {
      const ev = typeOf('ACTION.DELETE', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'DELETE_ACTION',
        actionId: ev.actionId,
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
  },
  guards: { targetIs },
}).createMachine({
  id,
  initial: 'list',
  context: {
    selectedActionId: undefined,
    actions: [],
    selectedAction: undefined,
    page: 1,
    totalPages: 1,
    totalCount: 0,
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
    ACTION_CREATED: { 
      actions: 'addCreatedAction',
      target: '.detail'
    },
    ACTION_UPDATED: { 
      actions: 'updateActionInList'
    },
    ACTION_DELETED: { 
      actions: 'removeDeletedAction',
      target: '.list'
    },
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
        'ACTION.SAVE_NEW': {
          actions: 'sendCreateAction',
        },
        'GO.BACK': {
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
        })
      },
      on: {
        'FORM.UPDATE_LABEL': { actions: 'updateFormLabel' },
        'FORM.UPDATE_DESCRIPTION': { actions: 'updateFormDescription' },
        'FORM.UPDATE_PARAMETERS': { actions: 'updateFormParameters' },
        'FORM.UPDATE_ACTION': { actions: 'updateFormAction' },
        'FORM.UPDATE_OUTPUT': { actions: 'updateFormOutput' },
        'FORM.UPDATE_CATEGORY': { actions: 'updateFormCategory' },
        'ACTION.UPDATE': {
          actions: 'sendUpdateAction',
        },
        'GO.BACK': {
          target: 'list',
        },
      },
    },
  },
})

export default actionsState