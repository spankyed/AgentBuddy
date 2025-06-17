import { assign, setup, type ActorRefFrom } from 'xstate';
import { safeEvents } from '@/core/types/safe-events';
import type {
  OutgoingBrainEvents,
} from '@abuddy/api'

export const id = 'brain';
export type BrainState = ActorRefFrom<typeof brainState>

// biome-ignore lint/suspicious/noEmptyInterface: <explanation>
export interface BrainContext {}

type SystemEvent = OutgoingBrainEvents

type UIEvent =
  | { type: 'TRACK.CLICK'; id: string }

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