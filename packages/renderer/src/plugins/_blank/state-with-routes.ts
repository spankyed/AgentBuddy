import { assign, setup } from 'xstate';
import breadcrumb, { safeEvents, targetIs, TRAIL_CLICK, type TrailClickEvent } from '@abuddy/sdk/fe';


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