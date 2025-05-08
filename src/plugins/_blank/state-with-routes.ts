import { assign, setup } from 'xstate';
import breadcrumb from '@/helpers/breadcrumb';
import { safeEvents } from '@/helpers/types/safe-events';
import {
  targetIs,          // guard that checks event.target against a CSS selector
  TRAIL_CLICK,        // helper that converts selector → state mappings
  type TrailClickEvent
} from '@/helpers/trail-actor';


export const id = '_blank';

// biome-ignore lint/suspicious/noEmptyInterface: <explanation>
export interface BlankContext {}

export type BlankEvent =
  | TrailClickEvent;

const typeOf = safeEvents<BlankEvent>();

const blankState = setup({
  types: {
    context: {} as BlankContext,
    events: {} as BlankEvent,
  },
  actors: {},
  actions: {},
  guards: {
    targetIs,
  },
}).createMachine({
  id,
  initial: 'display',

  context: ({ input }) => ({
  }),

  states: {
    display: {
      meta: breadcrumb('display', 'Display', true),
    },
  },

  on: {
    ...TRAIL_CLICK([
      ['.display', 'display'],
    ]),
  },
});

export default blankState;