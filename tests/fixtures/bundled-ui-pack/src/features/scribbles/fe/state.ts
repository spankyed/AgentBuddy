import { busId } from '#generated/bus-ids';
import { setup, type ActorRefFrom } from 'xstate';

export const id = busId.scribbles;

const scribblesState = setup({}).createMachine({ id });

export type ScribblesState = ActorRefFrom<typeof scribblesState>;

export default scribblesState;
