import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/core/actors/route-trailer';
import { safeEvents } from '@/core/types/safe-events';
import { setup, assign, log, fromPromise, spawnChild } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { StartupData, ThreadEntity, MessageEntity, OutgoingThreadsEvents, TagEntity, ThreadsViewData } from '@abuddy/api';
import { trpc } from '@/core/trpc';

const typeOf = safeEvents<UIEvent>();

export const id = 'threads' as const;
export type ThreadsState = ActorRefFrom<typeof threadsState>;

type SystemEvent =
  | { type: 'STARTUP'; pluginData: StartupData['threads'] }
  | OutgoingThreadsEvents

type UIEvent =
  | { type: 'SHOW_CREATE_FORM' }
  | { type: 'SELECT_THREAD'; id: string }
  | { type: 'CREATE_THREAD' }
  | { type: 'CANCEL_CREATE' }
  | { type: 'UPDATE_CREATE_DATA'; key: keyof CreateData; value: string }
  | { type: 'UPDATE_VIEW_DATA'; key: 'topic' | 'threadType'; value: string }
  | { type: 'UPDATE_THREAD_STATUS'; id: string; status: ThreadEntity['status'] }
  | { type: 'ADD_THREAD' }
  | { type: 'REMOVE_THREAD'; index: number }
  | { type: 'ADD_TAG' }
  | { type: 'REMOVE_TAG'; index: number }
  | { type: 'CLEAR_NEW_THREAD_FLAG'; id: string }
  | SystemEvent
  | TrailClickEvent;


export type ViewData = Partial<ThreadEntity> & ThreadsViewData;

export type CreateData = {
  topic: string;
  threadType: ThreadEntity['threadType'];
  tags: string[];
  relatedThreads: string[];
  instructions: string;
};
const defaultCreate: CreateData = {
  topic: '',
  threadType: 'work-item',
  tags: [],
  relatedThreads: [],
  instructions: '',
}

export type ThreadUIState = {
  isNew?: boolean;
};
export type ThreadWithUI = ThreadEntity & ThreadUIState;

interface ThreadsContext {
  threads: ThreadWithUI[];
  selectedThreadCode?: string;
  view: ViewData;
  create: CreateData;
}

const ANIMATION_DURATION = 2000; // 2 seconds, matching CSS animation duration

const threadsState = setup({
  types: { context: {} as ThreadsContext, events: {} as UIEvent },
  actors: {
    clearNewThreadFlag: fromPromise<void, { id: string }>(async ({ input, self }) => {
      await new Promise(resolve => setTimeout(resolve, ANIMATION_DURATION));
      self.send({ type: 'CLEAR_NEW_THREAD_FLAG', id: input.id });
    })
  },
  actions: {
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
          tags: data.tags,
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
        },
      };
    }),
    setPluginData: assign(({ event }) => {
      const typedEvent = typeOf('STARTUP', event);

      return {
        threads: typedEvent.pluginData.threads,
      };
    }),
    updateThreadData: assign(({ event, context }, params: { key: 'view' | 'create' }) => {
      const typedEvent = typeOf(['UPDATE_VIEW_DATA', 'UPDATE_CREATE_DATA'], event);
      const thread = context[params.key];
      
      if (typedEvent.key in thread) {
        thread[typedEvent.key] = typedEvent.value;
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
        create: thread as CreateData,
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
      const typedEvent = typeOf('REMOVE_THREAD', event);
      return {
        view: {
          ...context.view,
        }
      };
    }),
    addTag: assign(({ context }) => {
      return {
        view: {
          ...context.view,
          tags: [...(context.view.tags || [])]
        }
      };
    }),
    removeTag: assign(({ event, context }) => {
      const typedEvent = typeOf('REMOVE_TAG', event);
      return {
        view: {
          ...context.view,
          tags: [...(context.view.tags || [])].filter((_, index) => index !== typedEvent.index)
        }
      };
    }),
    clearNewThreadFlag: assign(({ context }) => {
      return {
        threads: context.threads.map(t => t.id === context.selectedThreadCode ? { ...t, isNew: false } : t),
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
    },
    create: { ...defaultCreate },
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
          actions: assign(({ event, context }) => {
            const typedEvent = typeOf('UPDATE_THREAD_STATUS', event);
            return {
              threads: context.threads.map(t => 
                t.id === typedEvent.id 
                  ? { ...t, status: typedEvent.status }
                  : t
              )
            };
          })
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
        UPDATE_VIEW_DATA: {
          actions: {
            type: 'updateThreadData',
            params: {
              key: 'view',
            }
          },
        },
        ADD_THREAD: {
          actions: 'addChildThread',
        },
        REMOVE_THREAD: {
          actions: 'removeChildThread',
        },
        ADD_TAG: {
          actions: 'addTag',
        },
        REMOVE_TAG: {
          actions: 'removeTag',
        },
      },
    },
  },
});

export default threadsState;