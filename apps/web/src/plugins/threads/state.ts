import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/core/actors/route-trailer';
import { safeEvents } from '@/core/types/safe-events';
import { setup, assign, log, fromPromise, spawnChild } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { StartupData, ThreadEntity, MessageEntity, OutgoingThreadsEvents, TagEntity, ThreadViewData, ThreadLink } from '@abuddy/api';
import { trpc } from '@/core/trpc';

const typeOf = safeEvents<UIEvent>();

export const id = 'threads' as const;
const defaultCreate: CreateData = {
  topic: '',
  threadType: 'work-item',
  tags: [],
  relatedThreads: [],
  instructions: '',
}

export type ThreadsState = ActorRefFrom<typeof threadsState>;
type SystemEvent =
  | { type: 'STARTUP'; pluginData: StartupData['threads'] }
  | OutgoingThreadsEvents
type UIEvent =
  | { type: 'SHOW_CREATE_FORM' }
  | { type: 'GO_BACK' }
  | { type: 'UPDATE_THREAD_STATUS'; id: string; status: ThreadEntity['status'] }
  | { type: 'SELECT_THREAD'; id: string }
  | { type: 'UPDATE_VIEW_DATA'; key: 'topic' | 'threadType' | 'tags'; value: string }
  | { type: 'CREATE_THREAD' }
  | { type: 'CANCEL_CREATE' }
  | { type: 'UPDATE_CREATE_DATA'; key: keyof CreateData; value: string }
  | { type: 'LINK_THREAD' }
  | { type: 'REMOVE_LINK'; index: number }
  | { type: 'UPDATE_TAGS';  newTags: TagItem[]; component: 'create' | 'view' }
  | { type: 'CLEAR_NEW_THREAD_FLAG'; id: string }
  | SystemEvent
  | TrailClickEvent;

export type ViewData = Partial<ThreadEntity> & ThreadViewData & {
  tags: TagItem[];
};

export type CreateData = {
  topic: string;
  threadType: ThreadEntity['threadType'];
  tags: TagItem[];
  relatedThreads: ThreadLink[];
  instructions: string;
};

export type ThreadUIState = {
  isNew?: boolean;
  tags?: TagItem[];
};
export type ThreadWithUI = ThreadEntity & ThreadUIState;
export type TagItem = Partial<TagEntity> & {
  id: TagEntity['id'];
  name: string;
  color?: string;
}

interface ThreadsContext {
  threads: ThreadWithUI[];
  selectedThreadCode?: string;
  view: ViewData ;
  create: CreateData;
  availableTags: TagItem[];
}

const threadsState = setup({
  types: { context: {} as ThreadsContext, events: {} as UIEvent },
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
        availableTags: typedEvent.pluginData.tags,
      };
    }),
    addThenResetCreateForm: assign(({ context, event }) => {
      const typedEvent = typeOf('THREAD_CREATED', event);
      const thread = context.create;
      const newThread = {
        ...thread,
        id: typedEvent.id,
        entityType: typedEvent.entityType,
        shortCode: typedEvent.shortCode,
        createdAt: typedEvent.timestamp,
        updatedAt: typedEvent.timestamp,
        timestamp: typedEvent.timestamp,
        status: 'draft',
        isNew: true, // Mark as new when created
      } as ThreadWithUI;

      return {
        threads: [newThread, ...context.threads],
        create: defaultCreate,
      }
    }),
    sendCreateThread: ({ context }) => {
      console.log('create', context.create);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'CREATE_THREAD',
        ...context.create,
        tags: context.create.tags.map(t => t.id),
      });
    },
    sendViewThread: ({ event }) => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'VIEW_THREAD',
        threadId: typeOf('SELECT_THREAD', event).id,
      });
    },
    setViewData: assign(({ event, context }) => {
      const { id, data } = typeOf('SET_VIEW_DATA', event);

      return {
        view: {
          ...context.view,
          messages: data.messages,
          relatedThreads: data.relatedThreads,
          tags: data.tags as TagItem[],
        }
      }
    }),
    setSelectedThread: assign(({ event, context }) => {
      const typedEvent = typeOf(['SELECT_THREAD', 'THREAD_CREATED'], event);
      const selectedThread = context.threads.find(t => t.id === typedEvent.id);
      
      return {
        selectedThreadCode: selectedThread?.shortCode,
        view: {
          ...selectedThread,
          tags: selectedThread?.tags as TagItem[],
        },
      };
    }),
    updateTags: assign(({ event, context }) => {
      const typedEvent = typeOf('UPDATE_TAGS', event);
      return {
        [typedEvent.component]: {
          ...context[typedEvent.component],
          tags: typedEvent.newTags,
        }
      }
    }),
    updateThreadData: assign(({ event, context }, params: { key: 'view' | 'create' }) => {
      const typedEvent = typeOf(['UPDATE_VIEW_DATA', 'UPDATE_CREATE_DATA'], event);
      const thread = context[params.key];
      
      if (typedEvent.key in thread) {
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        thread[typedEvent.key] = typedEvent.value as any;
      }

      if (params.key === 'view') {
        const viewThread = thread as ViewData;
        const { messages, relatedThreads, tags, ...updatedThread } = viewThread;
        const updateThreads = context.threads.map(t => t.id === viewThread.id ? updatedThread : t);
  
        return {
          threads: updateThreads as ThreadEntity[],
          view: viewThread,
        };
      }

      return {
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        create: thread as any satisfies CreateData,
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
    view: {
      messages: undefined,
      relatedThreads: [],
      tags: [],
    } as ViewData,
    create: { ...defaultCreate },
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
        UPDATE_CREATE_DATA: {
          actions: {
            type: 'updateThreadData',
            params: {
              key: 'create',
            }
          },
        },
      },
    },

    'view': {
      meta: { ...breadcrumbWithParams<ThreadsContext>('view', 'Thread', 'selectedThreadCode') },
      on: {
        GO_BACK: { target: 'list' },
        UPDATE_VIEW_DATA: {
          actions: {
            type: 'updateThreadData',
            params: {
              key: 'view',
            }
          },
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