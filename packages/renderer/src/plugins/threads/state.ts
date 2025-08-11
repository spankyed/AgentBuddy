import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/core/actors/route-trailer';
import { safeEvents } from '@/core/types/safe-events';
import { setup, assign, log, fromPromise, spawnChild } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { ThreadStartupData, ThreadEntity, OutgoingThreadsEvents, TagEntity, ThreadCreateData, ThreadViewData, ThreadTagItem, ThreadEditFields } from '@app/api';
import { trpc } from '@/core/trpc';
import type { Simplify } from '@/core/types/type-helpers';
import { application } from '@/core/actors/application';

export const id = 'threads' as const;

export type ThreadsState = ActorRefFrom<typeof threadsState>;

const defaultThread: ThreadCreateData | ThreadViewData = {
  topic: '',
  threadType: 'work-item',
  instructions: '',
  tags: [],
  linkedThreads: [],
}

type SystemEvent =
  | OutgoingThreadsEvents
  | { type: 'THREAD_STATUS_UPDATED'; threadId: string; status: ThreadEntity['status'] }
type UIEvent =
  | { type: 'OPEN_THREAD_CHAT'; threadId: string }
  | { type: 'SHOW_CREATE_FORM' }
  | { type: 'SHOW_CREATE_FORM_AS_CHILD'; parentThreadId: string }
  | { type: 'GO_BACK' }
  | { type: 'UPDATE_THREAD_STATUS'; id: string; status: ThreadEntity['status'] }
  | { type: 'SELECT_THREAD'; id: string }
  | { type: 'CREATE_THREAD' }
  | { type: 'CANCEL_CREATE' }
  | {
    type: 'UPDATE_THREAD_FIELD';
    key: keyof ThreadEditFields;
    value: ThreadEditFields[keyof ThreadEditFields];
    state: 'create' | 'view';
  }
  | { type: 'LINK_THREAD' }
  | { type: 'REMOVE_LINK'; index: number }
  | { type: 'CLEAR_NEW_THREAD_FLAG'; id: string }
type ThreadEvents =
  | UIEvent
  | SystemEvent
  | TrailClickEvent;

const typeOf = safeEvents<ThreadEvents>();

export type ThreadListItem = Simplify<ThreadEntity & {
  tags?: Partial<TagEntity>[];
  isNew?: boolean;
}>;

interface ThreadsContext {
  threads: ThreadListItem[];
  selectedThreadCode?: string;
  view: ThreadViewData;
  create: ThreadCreateData & { 
    parentThreadId?: string;
    parentThread?: ThreadListItem;
  };
  availableTags: ThreadTagItem[];
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
      const typedEvent = typeOf('THREAD_STARTUP', event);

      return {
        threads: typedEvent.data.threads,
        availableTags: typedEvent.data.availableTags,
      };
    }),
    addThenResetCreateForm: assign(({ context, event }) => {
      const typedEvent = typeOf('THREAD_CREATED', event);
      
      // Check if thread data is coming from the event (external creation) or context.create (internal creation)
      const hasEventData = 'topic' in typedEvent;
      
      const newThread: ThreadListItem = hasEventData ? {
        // Thread created externally (e.g., from add-to-thread.js)
        id: typedEvent.id,
        entityType: typedEvent.entityType as any,
        shortCode: typedEvent.shortCode,
        topic: typedEvent.topic!,
        threadType: typedEvent.threadType!,
        instructions: typedEvent.instructions!,
        status: typedEvent.status || 'backlog',
        createdAt: typedEvent.timestamp,
        updatedAt: typedEvent.timestamp,
        timestamp: typedEvent.timestamp,
        tags: [],
        isNew: true,
      } : {
        // Thread created internally from the threads plugin
        ...context.create,
        id: typedEvent.id,
        entityType: typedEvent.entityType as any,
        shortCode: typedEvent.shortCode,
        createdAt: typedEvent.timestamp,
        updatedAt: typedEvent.timestamp,
        timestamp: typedEvent.timestamp,
        status: 'backlog',
        tags: context.create.tags,
        isNew: true,
      };

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

      const { id, shortCode, status, timestamp, topic, threadType, instructions, tags } = selectedThread;
      
      return {
        selectedThreadCode: shortCode,
        view: {
          ...defaultThread,
          id, shortCode, status, timestamp, topic, threadType, instructions,
          tags: tags as ThreadTagItem[],
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
    addChildThread: assign(({ context }) => {
      return {
        view: {
          ...context.view,
        }
      };
    }),
    removeChildThread: assign(({ event, context }) => {
      const typedEvent = typeOf('REMOVE_LINK', event);
      return {
        view: {
          ...context.view,
        }
      };
    }),
    clearNewThreadFlag: assign(({ context, event }) => ({
      threads: context.threads.map(t => t.id === typeOf('CLEAR_NEW_THREAD_FLAG', event).id ? { ...t, isNew: false } : t),
    })),
    updateThreadStatus: assign(({ event, context }) => {
      const typedEvent = typeOf('UPDATE_THREAD_STATUS', event);
      // Send update to backend
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_THREAD_STATUS',
        threadId: typedEvent.id,
        status: typedEvent.status,
      });
      // Update local state
      return {
        threads: context.threads.map(t => 
          t.id === typedEvent.id 
            ? { ...t, status: typedEvent.status }
            : t
        )
      };
    }),
    updateThreadStatusFromBackend: assign(({ event, context }) => {
      const typedEvent = typeOf('THREAD_STATUS_UPDATED', event);
      return {
        threads: context.threads.map(t => 
          t.id === typedEvent.threadId 
            ? { ...t, status: typedEvent.status }
            : t
        )
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
  },
  guards: {
    targetIs
  }
}).createMachine({
  id,
  initial: 'list',
  context: () => ({
    threads: [],
    selectedThreadCode: undefined,
    view: {
      id: '' as ThreadEntity['id'],
      shortCode: '',
      status: 'backlog',
      timestamp: 0,
      ...defaultThread,
    } as ThreadViewData,
    create: { ...defaultThread },
    availableTags: [],
  }),
  on: {
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
    THREAD_STARTUP: {
      actions: 'setPluginData'
    },
    SET_VIEW_DATA: {
      actions: 'setViewData',
    },
    THREAD_STATUS_UPDATED: {
      actions: 'updateThreadStatusFromBackend',
    },
    // ...TRAIL_CLICK<UIEvent>([
    ...TRAIL_CLICK([
      ['.list', 'list'],
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
      meta: { ...breadcrumb('list', 'Threads', true) },
      on: {
        SHOW_CREATE_FORM: {
          target: 'create',
          actions: assign(() => ({
            create: { ...defaultThread }
          }))
        },
        SHOW_CREATE_FORM_AS_CHILD: {
          target: 'create',
          actions: 'setupParentThread'
        },
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
      },
    },

    'view': {
      meta: {
        ...breadcrumbWithParams<ThreadsContext>({
          target: 'view',
          prefix: 'Thread',
          paramName: 'selectedThreadCode'
        })
      },
      on: {
        GO_BACK: { target: 'list' },
        SHOW_CREATE_FORM_AS_CHILD: {
          target: 'create',
          actions: 'setupParentThread'
        },
        UPDATE_THREAD_FIELD: {
          actions: ['updateThreadData', 'updateThreadInThreads', 'sendUpdateThreadField'],
        },
        LINK_THREAD: {
          actions: 'addChildThread',
        },
        REMOVE_LINK: {
          actions: 'removeChildThread',
        },
      },
    },
  },
});

export default threadsState;