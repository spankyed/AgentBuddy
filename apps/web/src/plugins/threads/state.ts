import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/core/actors/route-trailer';
import { safeEvents } from '@/core/types/safe-events';
import { setup, assign, log, fromPromise, spawnChild } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { ThreadStartupData, ThreadEntity, OutgoingThreadsEvents, TagEntity, ThreadExtendedData, ThreadCreateData, ThreadTagItem, ThreadEditFields } from '@abuddy/api';
import { trpc } from '@/core/trpc';
import type { Simplify } from '@/core/types/type-helpers';

export const id = 'threads' as const;

export type ThreadsState = ActorRefFrom<typeof threadsState>;

const defaultThread: ThreadCreateData | ThreadViewData = {
  topic: '',
  threadType: 'work-item',
  instructions: '',
  tagsInput: [],
  relatedThreadsInput: [],
}

type SystemEvent =
  | { type: 'STARTUP'; pluginData: ThreadStartupData }
  | OutgoingThreadsEvents
type UIEvent =
  | { type: 'SHOW_CREATE_FORM' }
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
  | { type: 'UPDATE_TAGS';  newTags: ThreadTagItem[]; component: 'create' | 'view' }
  | { type: 'CLEAR_NEW_THREAD_FLAG'; id: string }
type ThreadEvents =
  | UIEvent
  | SystemEvent
  | TrailClickEvent;

const typeOf = safeEvents<ThreadEvents>();

export type ThreadAdditional = {
  tags?: Partial<TagEntity>[];
  isNew?: boolean;
};
export type ThreadListItem = Simplify<ThreadEntity & ThreadAdditional>;
type ThreadViewData = Simplify<ThreadCreateData & { messages?: ThreadExtendedData['messages'] }>;

interface ThreadsContext {
  threads: ThreadListItem[];
  selectedThreadCode?: string;
  view: ThreadViewData;
  create: ThreadCreateData;
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
    setPluginData: assign(({ event }) => {
      const typedEvent = typeOf('STARTUP', event);

      return {
        threads: typedEvent.pluginData.threads,
        availableTags: typedEvent.pluginData.availableTags,
      };
    }),
    addThenResetCreateForm: assign(({ context, event }) => {
      const typedEvent = typeOf('THREAD_CREATED', event);
      const { tagsInput, relatedThreadsInput, ...thread} = context.create;
      const newThread = {
        ...thread,
        id: typedEvent.id,
        entityType: typedEvent.entityType,
        shortCode: typedEvent.shortCode,
        createdAt: typedEvent.timestamp,
        updatedAt: typedEvent.timestamp,
        timestamp: typedEvent.timestamp,
        status: 'draft',
        tags: tagsInput,
        isNew: true, // Mark as new when created
      } as ThreadListItem;

      return {
        threads: [newThread, ...context.threads],
        create: defaultThread,
      }
    }),
    sendCreateThread: ({ context }) => {
      // console.log('create', context.create);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'CREATE_THREAD',
        ...context.create,
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
          messages: data.messages,
          relatedThreads: data.relatedThreads,
          tagsInput: data.tags as ThreadTagItem[],
          relatedThreadsInput: data.relatedThreads,
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
      
      return {
        selectedThreadCode: selectedThread?.shortCode,
        view: {
          ...defaultThread,
          topic: selectedThread.topic,
          threadType: selectedThread.threadType,
          instructions: selectedThread.instructions,
          tagsInput: selectedThread.tags as ThreadTagItem[],
        },
      };
    }),
    updateTags: assign(({ event, context }) => {
      const typedEvent = typeOf('UPDATE_TAGS', event);
      return {
        [typedEvent.component]: {
          ...context[typedEvent.component],
          tagsInput: typedEvent.newTags,
        }
      }
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
      return {
        threads: context.threads.map(t => 
          t.id === typedEvent.id 
            ? { ...t, status: typedEvent.status }
            : t
        )
      };
    }),
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
    view: { ...defaultThread },
    create: { ...defaultThread },
    availableTags: [],
  }),
  on: {
    CLEAR_NEW_THREAD_FLAG: {
      actions: 'clearNewThreadFlag'
    },
    THREAD_CREATED: {
      actions: [
        'addThenResetCreateForm',
        spawnChild('clearNewThreadFlag', {
          input: ({ event }) => ({
            id: typeOf('THREAD_CREATED', event).id,
          })
        })
      ]
    },
    STARTUP: {
      actions: 'setPluginData'
    },
    SET_VIEW_DATA: {
      actions: 'setViewData',
    },
    // ...TRAIL_CLICK<UIEvent>([
    ...TRAIL_CLICK([
      ['.list', 'list'],
      ['.create', 'create'],
      ['.view', 'view'],
    ]),
  },
  states: {
    'list': {
      meta: { ...breadcrumb('list', 'Threads', true) },
      on: {
        SHOW_CREATE_FORM: 'create',
        SELECT_THREAD: {
          target: 'view',
          actions: ['setSelectedThread', 'sendViewThread'],
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
        UPDATE_TAGS: {
          actions: 'updateTags',
        },
        UPDATE_THREAD_FIELD: {
          actions: 'updateThreadData',
        },
      },
    },

    'view': {
      meta: { ...breadcrumbWithParams<ThreadsContext>('view', 'Thread', 'selectedThreadCode') },
      on: {
        GO_BACK: { target: 'list' },
        UPDATE_THREAD_FIELD: {
          actions: 'updateThreadData',
        },
        UPDATE_TAGS: {
          actions: 'updateTags',
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