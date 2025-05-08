import breadcrumb, { breadcrumbWithParams } from '@/helpers/breadcrumb';
import { targetIs, TRAIL_CLICK, type TrailClickEvent } from '@/helpers/trail-actor';
import { safeEvents } from '@/helpers/types/safe-events';
import { setup, assign, log } from 'xstate';

export const id = 'threads';

interface ThreadsContext {
  selectedThreadId?: string;
}

type ThreadsEvent =
  | { type: 'SHOW_CREATE_FORM' }
  | { type: 'THREAD_CREATED'; id: string }
  | { type: 'SELECT_THREAD'; id: string }
  | { type: 'CANCEL_CREATE' }
  // internal
  | TrailClickEvent;

const typeOf = safeEvents<ThreadsEvent>();

// type Views = 'list' | 'create' | 'view';

const threadsState = setup({
  types: { context: {} as ThreadsContext, events: {} as ThreadsEvent },
  actors: {},
  actions: {
    setSelectedThreadId: assign({
      selectedThreadId: ({ event }) => typeOf(['SELECT_THREAD', 'THREAD_CREATED'], event).id,
    }),
  },
  guards: {
    targetIs
  }
}).createMachine({
  id,
  initial: 'list',
  context: () => ({
    selectedThreadId: undefined,
  }),
  on: {
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
        THREAD_CREATED: {
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