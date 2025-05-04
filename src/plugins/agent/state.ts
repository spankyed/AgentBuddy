import { setup } from 'xstate';

const blankState = setup({}).createMachine({
  id: 'code',
  context: {},
  states: {}
}); 

export default blankState;