import breadcrumb, { breadcrumbWithParams } from '@/helpers/breadcrumb';
import { setup, assign, log } from 'xstate';

export const id = 'threads';

interface ThreadsContext {
  selectedThreadId?: string;
}

type ThreadsEvents =
  | { type: 'SHOW_CREATE_FORM' }
  | { type: 'THREAD_CREATED'; id: string }
  | { type: 'SELECT_THREAD'; id: string }
  | { type: 'CANCEL_CREATE' }
  // internal
  | { type: 'TRAIL_CLICK'; target: string };


// type Views = 'list' | 'create' | 'view';

const threadsState = setup({
  types: { context: {} as ThreadsContext, events: {} as ThreadsEvents },
  actors: {},
  actions: {},
  guards: {
    targetIs: ({ event }, params: { view: string }) => {
      console.log('targetIs: ', event);
      return (event as any).target === params.view
    }
  }
}).createMachine({
  id,
  initial: 'list',
  context: () => ({
    selectedThreadId: undefined,
  }),
  on: {
    'TRAIL_CLICK': [
      {
        guard: { type: 'targetIs', params: { view: 'list' } },
        target: '.list',
      },
      // {
      //   guard: { type: 'targetIs', params: { view: 'create' } },
      //   target: '.create',
      // },
      // {
      //   guard: { type: 'targetIs', params: { view: 'view' } },
      //   target: '.view',
      // },
    ]
  },
  states: {
    'list': {
      meta: { ...breadcrumb('list', 'Threads', true) },
      on: {
        SHOW_CREATE_FORM: 'create',
        SELECT_THREAD: {
          target: 'view',
          actions: assign({
            selectedThreadId: (_, e) => (e as any)?.id,
          }),
        },
      },
    },

    'create': {
      meta: { ...breadcrumb('create', 'New Thread') },
      on: {
        THREAD_CREATED: {
          target: 'view',
          actions: assign({
            selectedThreadId: (_, e) => (e as any)?.id,
          }),
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