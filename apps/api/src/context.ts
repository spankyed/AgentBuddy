import { db } from './db/client';
import { createActor } from 'xstate';
import { agentMachine } from './agents/agentMachine';

export const sharedActor = createActor(agentMachine, {
  input: { model: 'gpt-4o' }
}).start();

export const createContext = () => ({
  db,
  actor: sharedActor
});

export type Context = ReturnType<typeof createContext>;