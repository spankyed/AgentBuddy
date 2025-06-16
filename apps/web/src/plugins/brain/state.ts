import { assign, setup, type ActorRefFrom } from 'xstate';
import { safeEvents } from '@/core/types/safe-events';
import type {
  OutgoingDatabaseEvents,
} from '@abuddy/api'

export const id = 'brain';
export type BrainState = ActorRefFrom<typeof brainState>

// biome-ignore lint/suspicious/noEmptyInterface: <explanation>
export interface BrainContext {}

type SystemEvent = OutgoingDatabaseEvents

type UIEvent =
  | { type: 'QUERY.EXECUTE'; code: string }
  | { type: 'SCHEMA.SELECT'; itemType: 'entity' | 'attribute' | 'relation'; value: string }
  | { type: 'QUERY.UPDATE'; code: string }

export type BrainEvents = UIEvent | SystemEvent
const typeOf = safeEvents<BrainEvents>()


const brainState = setup({
  types: {
    context: {} as BrainContext,
    events: {} as BrainEvents,
  },
  actors: {},
  actions: {},
  guards: {
  },
}).createMachine({
  id,
  context: ({ input }) => ({
  }),
  states: {},
  on: {
  },
});

export default brainState;