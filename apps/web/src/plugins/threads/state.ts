import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/core/actors/route-trailer';
import { safeEvents } from '@/core/types/safe-events';
import { setup, assign, log } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { StartupData, ThreadEntity, MessageEntity } from '@abuddy/api';
import type { EARS } from '@abuddy/api';

const typeOf = safeEvents<ThreadsEvent>();

export const id = 'threads' as const;
export type ThreadsState = ActorRefFrom<typeof threadsState>;

type ViewData = Partial<ThreadEntity> & {
  messages?: MessageEntity[];
  relatedThreads?: string[];
  tags?: string[];
  notes?: string;
}

type ThreadsEvent =
  | { type: 'SHOW_CREATE_FORM' }
  | { type: 'SELECT_THREAD'; id: string }
  | { type: 'CREATE_THREAD'; id: string }
  | { type: 'CANCEL_CREATE' }
  | { type: 'STARTUP'; pluginData: StartupData['threads'] }
  | { type: 'UPDATE_THREAD_DATA'; key: keyof ThreadEntity | 'notes' | 'tags' | 'relatedThreads'; value: unknown }
  | { type: 'ADD_THREAD' }
  | { type: 'REMOVE_THREAD'; index: number }
  | { type: 'ADD_TAG' }
  | { type: 'REMOVE_TAG'; index: number }
  | TrailClickEvent;
// type Views = 'list' | 'create' | 'view';
interface ThreadsContext {
  threads: ThreadEntity[];
  selectedThreadId?: string;
  view: ViewData
}

const threadsState = setup({
  types: { context: {} as ThreadsContext, events: {} as ThreadsEvent },
  actors: {},
  actions: {
    setSelectedThread: assign(({ event, context }) => {
      const typedEvent = typeOf('SELECT_THREAD', event);
      const selectedThread = context.threads.find(t => t.id === typedEvent.id);

      const messages: MessageEntity[] = [
        { id: 'msg-1', entityType: 'Message' as EARS.Entity.Message, content: 'This is a sample message that is quite long and should be truncated.', sender: 'user', timestamp: Date.now(), createdAt: Date.now() },
        { id: 'msg-2', entityType: 'Message' as EARS.Entity.Message, content: 'Another message that will not fit in one line.', sender: 'assistant', timestamp: Date.now(), createdAt: Date.now() },
        { id: 'msg-3', entityType: 'Message' as EARS.Entity.Message, content: 'Short message.', sender: 'user', timestamp: Date.now(), createdAt: Date.now() },
        { id: 'msg-4', entityType: 'Message' as EARS.Entity.Message, content: 'Yet another example of a long message that needs truncation. Yet another example of a long message that need. Yet another example of a long message that need.', sender: 'system', timestamp: Date.now(), createdAt: Date.now() },
        { id: 'msg-5', entityType: 'Message' as EARS.Entity.Message, content: 'Yet another example of a long message that needs truncation.', sender: 'system', timestamp: Date.now(), createdAt: Date.now() },
        { id: 'msg-6', entityType: 'Message' as EARS.Entity.Message, content: 'Yet another example of a long message that needs truncation.', sender: 'system', timestamp: Date.now(), createdAt: Date.now() },
        { id: 'msg-7', entityType: 'Message' as EARS.Entity.Message, content: 'Yet another example of a long message that needs truncation.', sender: 'system', timestamp: Date.now(), createdAt: Date.now() },
        { id: 'msg-8', entityType: 'Message' as EARS.Entity.Message, content: 'Yet another example of a long message that needs truncation.', sender: 'system', timestamp: Date.now(), createdAt: Date.now() },
        { id: 'msg-9', entityType: 'Message' as EARS.Entity.Message, content: 'Yet another example of a long message that needs truncation.', sender: 'system', timestamp: Date.now(), createdAt: Date.now() },
        { id: 'msg-10', entityType: 'Message' as EARS.Entity.Message, content: 'Yet another example of a long message that needs truncation.', sender: 'system', timestamp: Date.now(), createdAt: Date.now() },
        { id: 'msg-11', entityType: 'Message' as EARS.Entity.Message, content: 'Yet another example of a long message that needs truncation.', sender: 'system', timestamp: Date.now(), createdAt: Date.now() },
        { id: 'msg-12', entityType: 'Message' as EARS.Entity.Message, content: 'Final message to demonstrate overflow handling.', sender: 'user', timestamp: Date.now(), createdAt: Date.now() }
      ];
      const relatedThreads = ['U-182', 'P-13', 'WI-7'];
      
      return {
        selectedThreadId: selectedThread?.shortCode,
        view: {
          ...selectedThread,
          messages,
          relatedThreads,
        },
      };
    }),
    setPluginData: assign(({ event }) => {
      const typedEvent = typeOf('STARTUP', event);
      console.log("typedEvent: ", typedEvent);

      // Access the threads directly from the startup data
      return {
        threads: typedEvent.pluginData.threads,
        selectedThreadId: typedEvent.pluginData.threads[0]?.shortCode,
        // view: {
        //   selectedThread: typedEvent.pluginData.threads[0],
        //   messages: [],
        // },
      };
    }),
    updateThreadData: assign(({ event, context }) => {
      const typedEvent = typeOf('UPDATE_THREAD_DATA', event);
      const thread = context.view;
      
      if (typedEvent.key in thread) {
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        thread[typedEvent.key] = typedEvent.value as any;
      }

      const { messages, relatedThreads, tags, notes, ...updatedThread } = thread;
      const updateThreads = context.threads.map(t => t.id === thread.id ? updatedThread : t);

      return {
        threads: updateThreads as ThreadEntity[],
        view: thread
      };
    }),
    addThread: assign(({ context }) => {
      const relatedThreads = [...(context.view.relatedThreads || []), ''];
      return {
        view: {
          ...context.view,
          relatedThreads
        }
      };
    }),
    removeThread: assign(({ event, context }) => {
      const typedEvent = typeOf('REMOVE_THREAD', event);
      const relatedThreads = [...(context.view.relatedThreads || [])];
      relatedThreads.splice(typedEvent.index, 1);
      return {
        view: {
          ...context.view,
          relatedThreads
        }
      };
    }),
    addTag: assign(({ context }) => {
      const tags = [...(context.view.tags || []), ''];
      return {
        view: {
          ...context.view,
          tags
        }
      };
    }),
    removeTag: assign(({ event, context }) => {
      const typedEvent = typeOf('REMOVE_TAG', event);
      const tags = [...(context.view.tags || [])];
      tags.splice(typedEvent.index, 1);
      return {
        view: {
          ...context.view,
          tags
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
      notes: undefined,
    },
  }),
  on: {
    STARTUP: {
      actions: 'setPluginData'
    },
    // ...TRAIL_CLICK<ThreadsEvent>([
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
          actions: 'setSelectedThread',
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