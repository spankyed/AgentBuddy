import { assign, setup } from 'xstate';
import breadcrumb from '@/core/breadcrumb';
import { safeEvents } from '@/core/types/safe-events';
import {
  targetIs,          // guard that checks event.target against a CSS selector
  TRAIL_CLICK,        // helper that converts selector → state mappings
  type TrailClickEvent
} from '@/core/actors/route-trailer';


export const id = 'flows';

// biome-ignore lint/suspicious/noEmptyInterface: <explanation>
export interface FlowsContext {}

export type FlowsEvent =
  | TrailClickEvent;

const typeOf = safeEvents<FlowsEvent>();

const flowsState = setup({
  types: {
    context: {} as FlowsContext,
    events: {} as FlowsEvent,
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

export default flowsState;