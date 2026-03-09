import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/core/actors/route-trailer';
import { safeEvents } from '@/core/types/safe-events';
import { setup, assign, log, fromPromise, spawnChild } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { ThreadConnectedData, ThreadEntity, ThreadExtended, OutgoingThreadsEvents, ThreadCreateData, ThreadViewData, ThreadTagOption, ThreadEditFields, ThreadsSettings, EARS } from '@app/api';
import { trpc } from '@/core/trpc';
import type { Simplify } from '@/core/types/type-helpers';
import { application } from '@/core/actors/application';

export const id = 'threads' as const;

const THREADS_VIEW_KEY = 'threads-view-preference';

function getInitialView(): 'list' | 'kanban' {
  try {
    const stored = localStorage.getItem(THREADS_VIEW_KEY);
    if (stored === 'kanban') return 'kanban';
  } catch {}
  return 'list';
}

export type ThreadsState = ActorRefFrom<typeof threadsState>;

const defaultThread: ThreadCreateData | ThreadViewData = {
  topic: '',
  instructions: '',
  tags: [],
  linkedThreads: [],
}

type SystemEvent =
  | OutgoingThreadsEvents
  | { type: 'THREAD_UPDATED'; threadId: string; updates: Partial<Pick<ThreadEntity, 'status' | 'tags'>> }
  | { type: 'THREADS_SETTINGS_UPDATED'; settings: ThreadsSettings }
  | { type: 'THREAD_DELETED'; threadId: string }
type UIEvent =
  | { type: 'OPEN_THREAD_CHAT'; threadId: string }
  | { type: 'SHOW_CREATE_FORM' }
  | { type: 'SHOW_CREATE_FORM_AS_CHILD'; parentThreadId: string }
  | { type: 'VIEW_LIST' }
  | { type: 'VIEW_KANBAN' }
  | { type: 'UPDATE_THREAD_STATUS'; id: string; status: ThreadEntity['status'] }
  | { type: 'SELECT_THREAD'; id: string }
  | { type: 'CREATE_THREAD' }
  | { type: 'CANCEL_CREATE' }
  | { type: 'DELETE_THREAD'; threadId: string }
  | {
    type: 'UPDATE_THREAD_FIELD';
    key: keyof ThreadEditFields;
    value: ThreadEditFields[keyof ThreadEditFields];
    state: 'create' | 'view';
  }
  | { type: 'CLEAR_NEW_THREAD_FLAG'; id: string }
  | { type: 'TOGGLE_TAGS_SECTION'; show: boolean }
  | { type: 'TOGGLE_LINKED_SECTION'; show: boolean }
type ThreadEvents =
  | UIEvent
  | SystemEvent
  | TrailClickEvent;

const typeOf = safeEvents<ThreadEvents>();

export type ThreadListItem = Simplify<ThreadEntity & {
  tags?: string[];
  isNew?: boolean;
}>;

interface ThreadsContext {
  threads: ThreadListItem[];
  selectedThreadCode?: string;
  view: ThreadViewData;
  create: ThreadCreateData & {
    parentThreadId?: string;
    parentThread?: ThreadListItem;
    tagsExpanded?: boolean;
    linkedExpanded?: boolean;
  };
  availableTags: ThreadTagOption[];
  settings: ThreadsSettings | null;
}

const threadsState = setup({
  types: { context: {} as ThreadsContext, events: {} as ThreadEvents },
  actors: {
    clearNewThreadFlag: fromPromise<void, { id: string }>(async ({ input, system }) => {
      const ANIMATION_DURATION = 1000;
      await new Promise(resolve => setTimeout(resolve, ANIMATION_DURATION));
      system.get(id).send({ type: 'CLEAR_NEW_THREAD_FLAG', id: input.id });
    })
  },
  actions: {
    openAgentChat: ({ system, event  }) => {
      const threadId = typeOf('OPEN_THREAD_CHAT', event).threadId;
      system.get('agent').send({ type: 'OPEN_THREAD_CHAT', threadId });
      system.get(application).send({ type: 'SELECT_PLUGIN', pluginId: 'agent' });
    },
    setupParentThread: assign(({ event, context }) => {
      const typedEvent = typeOf('SHOW_CREATE_FORM_AS_CHILD', event);
      const parentThread = context.threads.find(t => t.id === typedEvent.parentThreadId);

      if (!parentThread) {
        console.warn(`Parent thread with id ${typedEvent.parentThreadId} not found`);
        return {};
      }

      // Store parent thread info for display and to send to backend
      // The backend should handle creating the proper parent_of relationship
      // from the parent to this new child thread
      return {
        create: {
          ...defaultThread,
          parentThreadId: parentThread.id, // Store parent ID for backend processing
          parentThread: parentThread // Store full parent info for display
        }
      };
    }),
    setPluginData: assign(({ event }) => {
      const typedEvent = typeOf('THREAD_CONNECTED', event);

      return {
        threads: typedEvent.data.threads,
        availableTags: typedEvent.data.availableTags,
        settings: typedEvent.data.settings,
      };
    }),
    addThenResetCreateForm: assign(({ context, event }) => {
      const typedEvent = typeOf('THREAD_CREATED', event);
      const newThread: ThreadListItem = {
        // Thread created internally from the threads plugin
        ...context.create,
        createdAt: typedEvent.timestamp,
        updatedAt: typedEvent.timestamp,
        status: '',
        tags: context.create.tags,
          isNew: true,
          ...typedEvent
      } as ThreadListItem;

      return {
        threads: [newThread, ...context.threads],
        create: defaultThread,
      }
    }),
    sendCreateThread: ({ context }) => {
      // console.log('create', context.create);
      const { parentThread, ...createData } = context.create;
      trpc.bus.send.mutate({
        systemId: id,
        type: 'CREATE_THREAD',
        ...createData,
        // Include parentThreadId if present (for parent-child relationship)
        parentThreadId: context.create.parentThreadId
      });
    },
    sendViewThread: ({ event }) => {
      const threadId = typeOf('SELECT_THREAD', event).id;
      trpc.bus.send.mutate({
        systemId: id,
        type: 'VIEW_THREAD',
        threadId,
      });
    },
    setViewData: assign(({ event, context }) => {
      const { id, data } = typeOf('SET_VIEW_DATA', event);

      return {
        view: {
          ...context.view,
          ...data,
          id,
        }
      }
    }),
    setSelectedThread: assign(({ event, context }) => {
      const typedEvent = typeOf(['SELECT_THREAD', 'THREAD_CREATED'], event);
      const selectedThread = context.threads.find(t => t.id === typedEvent.id);
      if (!selectedThread) {
        console.warn(`Selected thread with id ${typedEvent.id} not found in context.`);
        return {};
      }

      const { id, shortCode, status, timestamp, topic, instructions, tags } = selectedThread;

      return {
        selectedThreadCode: shortCode,
        view: {
          ...defaultThread,
          id, shortCode, status, timestamp, topic, instructions,
          tags: tags as string[],
        },
      };
    }),
    updateThreadData: assign(({ event, context }) => {
      const typedEvent = typeOf('UPDATE_THREAD_FIELD', event);
      const { key, value, state } = typedEvent;

      return {
        [state]: {
          ...context[state],
          [key]: value,
        },
      } as Pick<typeof context, typeof state>;
    }),
    updateThreadInThreads: assign(({ event, context }) => {
      const typedEvent = typeOf('UPDATE_THREAD_FIELD', event);

      const { messages, linkedThreads, ...rest } = context.view;
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      (rest as any)[typedEvent.key] = typedEvent.value as any;
      const newThread = rest as ThreadListItem;
      return {
        threads: context.threads.map(t => t.id === context.view.id ? newThread : t),
      };
    }),
    clearNewThreadFlag: assign(({ context, event }) => ({
      threads: context.threads.map(t => t.id === typeOf('CLEAR_NEW_THREAD_FLAG', event).id ? { ...t, isNew: false } : t),
    })),
    updateThreadStatus: ({ event, context }) => {
      const typedEvent = typeOf('UPDATE_THREAD_STATUS', event);
      // Send update to backend
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_THREAD_STATUS',
        threadId: typedEvent.id,
        status: typedEvent.status,
      });
      // Note: Local state will be updated when we receive THREAD_UPDATED from backend
    },
    updateThreadFromBackend: assign(({ event, context }) => {
      const typedEvent = typeOf('THREAD_UPDATED', event);
      const { threadId, updates } = typedEvent;

      return {
        threads: context.threads.map(t =>
          t.id === threadId
            ? { ...t, ...updates }
            : t
        ),
        // Also update view if it's the current thread
        view: context.view.id === threadId
          ? { ...context.view, ...updates }
          : context.view
      };
    }),
    sendUpdateThreadField: ({ event, context }) => {
      const { key, value } = typeOf('UPDATE_THREAD_FIELD', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_THREAD_FIELD',
        threadId: context.view.id,
        key,
        value,
      });
    },
    setThreadsSettings: assign(({ event, context }) => {
      const ev = typeOf('THREADS_SETTINGS_UPDATED', event);
      // Update both settings and available tags when settings change
      return {
        settings: ev.settings,
        availableTags: ev.settings?.tags || []
      };
    }),
    deleteThread: ({ event }) => {
      const { threadId } = typeOf('DELETE_THREAD', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'DELETE_THREAD',
        threadId,
      });
    },
    persistListView: () => { try { localStorage.setItem(THREADS_VIEW_KEY, 'list'); } catch {} },
    persistKanbanView: () => { try { localStorage.setItem(THREADS_VIEW_KEY, 'kanban'); } catch {} },
    removeThreadFromList: assign(({ event, context }) => {
      const { threadId } = typeOf('THREAD_DELETED', event);
      return {
        threads: context.threads.filter(t => t.id !== threadId),
        // Clear view if it was the deleted thread
        view: context.view.id === threadId ? { ...defaultThread, id: '' as EARS.EntityId, shortCode: '', status: '', timestamp: 0 } as ThreadViewData : context.view,
        selectedThreadCode: context.view.id === threadId ? undefined : context.selectedThreadCode,
      };
    }),
  },
  guards: {
    targetIs
  }
}).createMachine({
  id,
  initial: getInitialView(),
  context: () => ({
    threads: [],
    selectedThreadCode: undefined,
    view: {
      id: '' as ThreadEntity['id'],
      shortCode: '',
      status: '',
      timestamp: 0,
      ...defaultThread,
    } as ThreadViewData,
    create: { ...defaultThread },
    availableTags: [],
    settings: null,
  }),
  on: {
    SHOW_CREATE_FORM: {
      target: '.create',
      actions: assign(() => ({
        create: { ...defaultThread }
      }))
    },
    UPDATE_THREAD_STATUS: {
      actions: 'updateThreadStatus',
    },
    VIEW_LIST: { target: '.list' },
    VIEW_KANBAN: { target: '.kanban' },
    OPEN_THREAD_CHAT: {
      actions: 'openAgentChat'
    },
    CLEAR_NEW_THREAD_FLAG: {
      actions: 'clearNewThreadFlag'
    },
    THREAD_CREATED: {
      actions: [
        'addThenResetCreateForm',
        spawnChild('clearNewThreadFlag', {
          id: ({ event }) => `clear-new-thread-flag-${typeOf('THREAD_CREATED', event).id}`,
          input: ({ event }) => ({
            id: typeOf('THREAD_CREATED', event).id,
          })
        })
      ]
    },
    THREAD_CONNECTED: {
      actions: 'setPluginData'
    },
    SET_VIEW_DATA: {
      actions: 'setViewData',
    },
    THREAD_UPDATED: {
      actions: 'updateThreadFromBackend',
    },
    THREADS_SETTINGS_UPDATED: {
      actions: 'setThreadsSettings',
    },
    DELETE_THREAD: {
      actions: 'deleteThread',
    },
    THREAD_DELETED: {
      actions: 'removeThreadFromList',
    },
    // ...TRAIL_CLICK<UIEvent>([
    ...TRAIL_CLICK([
      ['.list', 'list'],
      ['.kanban', 'kanban'],
      ['.create', 'create'],
      ['.view', 'view'],
    ]),
    SELECT_THREAD: {
      target: '.view',
      actions: ['setSelectedThread', 'sendViewThread'],
    },
  },
  states: {
    'list': {
      entry: 'persistListView',
      meta: { ...breadcrumb('list', 'Threads', true) },
      on: {

      },
    },

    'kanban': {
      entry: 'persistKanbanView',
      meta: { ...breadcrumb('kanban', 'Board') },
      on: {
        UPDATE_THREAD_STATUS: {
          actions: 'updateThreadStatus',
        },
      },
    },

    'create': {
      meta: { ...breadcrumb('create', 'New Thread') },
      on: {
        CREATE_THREAD: {
          target: 'list',
          actions: 'sendCreateThread',
        },
        CANCEL_CREATE: { target: 'list' },
        UPDATE_THREAD_FIELD: {
          actions: 'updateThreadData',
        },
        TOGGLE_TAGS_SECTION: {
          actions: assign({
            create: ({ context, event }) => ({
              ...context.create,
              tagsExpanded: typeOf('TOGGLE_TAGS_SECTION', event).show
            })
          })
        },
        TOGGLE_LINKED_SECTION: {
          actions: assign({
            create: ({ context, event }) => ({
              ...context.create,
              linkedExpanded: typeOf('TOGGLE_LINKED_SECTION', event).show
            })
          })
        },
      },
    },

    'view': {
      meta: {
        ...breadcrumbWithParams<ThreadsContext>({
          target: 'view',
          getLabel: (ctx) => ctx.view.topic || 'Untitled Thread'
        })
      },
      on: {
        SHOW_CREATE_FORM_AS_CHILD: {
          target: 'create',
          actions: 'setupParentThread'
        },
        UPDATE_THREAD_FIELD: {
          actions: ['updateThreadData', 'updateThreadInThreads', 'sendUpdateThreadField'],
        },
      },
    },
  },
});

export default threadsState;
