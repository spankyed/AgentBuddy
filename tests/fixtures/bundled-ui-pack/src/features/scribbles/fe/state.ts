import { pluginId } from '#generated/events';
import { setup, type ActorRefFrom } from 'xstate';

export const id = pluginId.scribbles;

const scribblesState = setup({}).createMachine({ id });

export type ScribblesState = ActorRefFrom<typeof scribblesState>;

export default scribblesState;
