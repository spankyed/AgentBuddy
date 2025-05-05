import { setup } from 'xstate';

export const id = 'threads';

const threadsState = setup({}).createMachine({
  id,
  context: {},
  states: {}
}); 

export default threadsState;