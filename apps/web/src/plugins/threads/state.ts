import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/core/actors/route-trailer';
import { safeEvents } from '@/core/types/safe-events';
import { setup, assign, log } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { StartupData, ThreadEntity } from '@abuddy/api';

const typeOf = safeEvents<ThreadsEvent>();

export const id = 'threads' as const;
export type ThreadsState = ActorRefFrom<typeof threadsState>;

type ThreadsEvent =
  | { type: 'SHOW_CREATE_FORM' }
  | { type: 'SELECT_THREAD'; id: string }
  | { type: 'CREATE_THREAD'; id: string }
  | { type: 'CANCEL_CREATE' }
  | { type: 'STARTUP'; pluginData: StartupData['threads'] }
  | TrailClickEvent;
// type Views = 'list' | 'create' | 'view';
interface ThreadsContext {
  threads: ThreadEntity[];
  selectedThreadId?: string;
}

const threadsState = setup({
  types: { context: {} as ThreadsContext, events: {} as ThreadsEvent },
  actors: {},
  actions: {
    setSelectedThreadId: assign({
      selectedThreadId: ({ event }) => typeOf(['SELECT_THREAD', 'CREATE_THREAD'], event).id,
    }),
    setPluginData: assign(({ event }) => {
      const typedEvent = typeOf('STARTUP', event);
      console.log("typedEvent: ", typedEvent);

      // Access the threads directly from the startup data
      return {
        threads: typedEvent.pluginData.threads,
        selectedThreadId: typedEvent.pluginData.threads[0]?.id,
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
          actions: 'setSelectedThreadId',
        },
      },
    },

    'create': {
      meta: { ...breadcrumb('create', 'New Thread') },
      on: {
        CREATE_THREAD: {
          target: 'view',
          actions: 'setSelectedThreadId',
        },
        CANCEL_CREATE: { target: 'list' },
      },
    },

    'view': {
      meta: { ...breadcrumbWithParams<ThreadsContext>('view', 'Thread', 'selectedThreadId') },
    },
  },
});

export default threadsState;