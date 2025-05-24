import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/core/actors/route-trailer';
import { safeEvents } from '@/core/types/safe-events';
import { setup, assign, log } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { StartupData, ThreadEntity, MessageEntity, OutgoingThreadsEvents, TagEntity } from '@abuddy/api';
import type { EARS } from '@abuddy/api';
import { trpc } from '@/core/trpc';

const typeOf = safeEvents<UIEvent>();

export const id = 'threads' as const;
export type ThreadsState = ActorRefFrom<typeof threadsState>;

type ViewData = Partial<ThreadEntity> & {
  messages?: Partial<MessageEntity>[];
  relatedThreads?: Partial<ThreadEntity>[];
  tags?: Partial<TagEntity>[];
}

type SystemEvent =
  | { type: 'STARTUP'; pluginData: StartupData['threads'] }
  | OutgoingThreadsEvents

type UIEvent =
  | { type: 'SHOW_CREATE_FORM' }
  | { type: 'SELECT_THREAD'; id: string }
  | { type: 'CREATE_THREAD'; id: string }
  | { type: 'CANCEL_CREATE' }
  | { type: 'UPDATE_THREAD_DATA'; key: keyof ThreadEntity | 'tags' | 'relatedThreads'; value: unknown }
  | { type: 'ADD_THREAD' }
  | { type: 'REMOVE_THREAD'; index: number }
  | { type: 'ADD_TAG' }
  | { type: 'REMOVE_TAG'; index: number }
  | SystemEvent
  | TrailClickEvent;

interface ThreadsContext {
  threads: ThreadEntity[];
  selectedThreadId?: string;
  view: ViewData
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
        selectedThreadId: selectedThread?.shortCode,
        view: {
          ...selectedThread,
        },
      };
    }),
    setPluginData: assign(({ event }) => {
      const typedEvent = typeOf('STARTUP', event);

      return {
        threads: typedEvent.pluginData.threads,
        selectedThreadId: typedEvent.pluginData.threads[0]?.shortCode,
      };
    }),
    updateThreadData: assign(({ event, context }) => {
      const typedEvent = typeOf('UPDATE_THREAD_DATA', event);
      const thread = context.view;
      
      if (typedEvent.key in thread) {
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        thread[typedEvent.key] = typedEvent.value as any;
      }

      const { messages, relatedThreads, tags, ...updatedThread } = thread;
      const updateThreads = context.threads.map(t => t.id === thread.id ? updatedThread : t);

      return {
        threads: updateThreads as ThreadEntity[],
        view: thread
      };
    }),
    addThread: assign(({ context }) => {
      return {
        view: {
          ...context.view,
        }
      };
    }),
    removeThread: assign(({ event, context }) => {
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
    selectedThreadId: undefined,
    view: {
      messages: undefined,
      relatedThreads: undefined,
      tags: undefined,
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
          actions: 'setSelectedThread',
        },
        CANCEL_CREATE: { target: 'list' },
      },
    },

    'view': {
      meta: { ...breadcrumbWithParams<ThreadsContext>('view', 'Thread', 'selectedThreadId') },
      on: {
        UPDATE_THREAD_DATA: {
          actions: 'updateThreadData',
        },
        ADD_THREAD: {
          actions: 'addThread',
        },
        REMOVE_THREAD: {
          actions: 'removeThread',
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