import { setup, type ActorRefFrom } from 'xstate';

export const id = 'scribbles' as const;

const scribblesState = setup({}).createMachine({ id });

export type ScribblesState = ActorRefFrom<typeof scribblesState>;

export default scribblesState;
