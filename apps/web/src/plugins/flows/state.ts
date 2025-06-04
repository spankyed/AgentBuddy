import { assign, setup } from 'xstate';
import breadcrumb from '@/core/breadcrumb';
import { safeEvents } from '@/core/types/safe-events';
import {
  targetIs,          // guard that checks event.target against a CSS selector
  TRAIL_CLICK,        // helper that converts selector → state mappings
  type TrailClickEvent
} from '@/core/actors/route-trailer';
import type { FlowsStartupData, OutgoingFlowsEvents } from '@abuddy/api';


export const id = 'flows';

// biome-ignore lint/suspicious/noEmptyInterface: <explanation>
export interface FlowsContext {
  entity: FlowsStartupData['entity'];
  relation: FlowsStartupData['relation'];
  role: FlowsStartupData['role'];
}

type SystemEvent =
  | OutgoingFlowsEvents
type UIEvent =
  | { type: 'OPEN_STEP_EDITOR'; flowId: string }

export type FlowsEvents =
  | UIEvent
  | SystemEvent
  | TrailClickEvent;

const typeOf = safeEvents<FlowsEvents>();

const flowsState = setup({
  types: {
    context: {} as FlowsContext,
    events: {} as FlowsEvents,
  },
  actors: {},
  actions: {
    setPluginData: assign(({ event }) => {
      const typedEvent = typeOf('FLOWS_STARTUP', event);
      console.log('flows startup', typedEvent.data);
      return {
        entity: typedEvent.data.entity,
        relation: typedEvent.data.relation,
        role: typedEvent.data.role,
      };
    }),
  },
  guards: {
    targetIs,
  },
}).createMachine({
  id,
  initial: 'display',
  context: ({ input }) => ({
    entity: [] as unknown as FlowsStartupData['entity'],
    relation: [] as unknown as FlowsStartupData['relation'],
    role: [] as unknown as FlowsStartupData['role'],
  }),
  states: {
    display: {
      meta: breadcrumb('display', 'Display', true),
    },
  },
  on: {
    FLOWS_STARTUP: {
      actions: 'setPluginData',
    },
    ...TRAIL_CLICK([
      ['.display', 'display'],
    ]),
  },
});

export default flowsState;