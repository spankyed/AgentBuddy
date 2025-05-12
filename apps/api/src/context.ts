import { db } from './db/client';
import { createActor } from 'xstate';
import { agentMachine } from './state/bus';

export const sharedActor = createActor(agentMachine, {
  input: { model: 'gpt-4o' }
}).start();

export const createContext = () => ({
  db,
  actor: sharedActor
});

export type Context = ReturnType<typeof createContext>;