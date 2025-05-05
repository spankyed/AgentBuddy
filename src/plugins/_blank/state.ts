import { setup } from 'xstate';

export const id = '_blank';

const blankState = setup({}).createMachine({
  id,
  context: {},
  states: {}
}); 

export default blankState;