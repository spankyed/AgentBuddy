import { setup, type ActorRefFrom } from 'xstate';
import type { __PASCAL__Context, __PASCAL__Inbox } from './contract.ts';

// The feature's name, which this pack's code sends to and opens the plugin by (`openPlugin` from #generated/fe)
export const id = '__NAME__';
export type __PASCAL__State = ActorRefFrom<typeof __CAMEL__State>;

const __CAMEL__State = setup({
  types: {
    context: {} as __PASCAL__Context,
    events: {} as __PASCAL__Inbox | { type: string },
  },
}).createMachine({
  id,
  initial: 'idle',
  context: { ready: false },
  states: {
    idle: {},
  },
});

export default __CAMEL__State;
