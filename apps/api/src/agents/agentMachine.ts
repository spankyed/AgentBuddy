import { createMachine } from 'xstate';
export const agentMachine = createMachine({ id: 'agent', initial: 'idle', states: { idle: {} } });
