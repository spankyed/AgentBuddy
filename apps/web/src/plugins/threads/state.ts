import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/core/actors/route-trailer';
import { safeEvents } from '@/core/types/safe-events';
import { setup, assign, log } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { StartupData, ThreadEntity, MessageEntity, OutgoingThreadsEvents, TagEntity, ThreadsViewData } from '@abuddy/api';
import type { EARS } from '@abuddy/api';
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
  | { type: 'ADD_THREAD' }
  | { type: 'REMOVE_THREAD'; index: number }
  | { type: 'ADD_TAG' }
  | { type: 'REMOVE_TAG'; index: number }
  | SystemEvent
  | TrailClickEvent;


export type ViewData = Partial<ThreadEntity> & ThreadsViewData;

export type CreateData = {
  topic: string;
  threadType: ThreadEntity['threadType'];
  tags: string[];
  relatedThreads?: string[];
  instructions: string;
};

interface ThreadsContext {
  threads: ThreadEntity[];
  selectedThreadCode?: string;
  view: ViewData;
  create: CreateData;
}

const threadsState = setup({
  types: { context: {} as ThreadsContext, events: {} as UIEvent },
  actors: {},
  actions: {
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
      const typedEvent = typeOf('SELECT_THREAD', event);
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
      relatedThreads: undefined,
      tags: undefined,
    },
    create: {
      topic: '',
      threadType: 'work-item',
      tags: [],
      relatedThreads: [],
      instructions: '',
    },
  }),
  on: {
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
      },
    },

    'create': {
      meta: { ...breadcrumb('create', 'New Thread') },
      on: {
        CREATE_THREAD: {
          target: 'view',
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