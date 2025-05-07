import { setup } from 'xstate';

export const id = 'threads';

const threadsState = setup({
  types: {
    context: {} as {
      showCreateForm: boolean;
    },
    events: {} as 
      | { type: 'SHOW_CREATE_FORM' }
      | { type: 'HIDE_CREATE_FORM' }
  }
}).createMachine({
  id,
  context: {
    showCreateForm: false,
  },
  on: {
    SHOW_CREATE_FORM: {
      actions: ({ context }) => {
        context.showCreateForm = true;
      },
    },
    HIDE_CREATE_FORM: {
      actions: ({ context }) => {
        context.showCreateForm = false;
      },
    }
  }
}); 

export default threadsState;