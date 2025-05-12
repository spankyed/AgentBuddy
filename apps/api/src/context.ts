import { db } from './db/client';
import { createActor } from 'xstate';
import { busMachine } from './state/bus-state';

export const sharedActor = createActor(busMachine, {
  input: { model: 'gpt-4o' }
}).start();

export const createContext = () => ({
  db,
  actor: sharedActor
});

export type Context = ReturnType<typeof createContext>;