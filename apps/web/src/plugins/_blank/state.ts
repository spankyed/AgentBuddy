import { setup, type ActorRefFrom } from 'xstate';

export const id = '_blank' as const;

export type BlankState = ActorRefFrom<typeof blankState>;

const blankState = setup({}).createMachine({
  id,
  context: {},
  states: {}
}); 

export default blankState;
