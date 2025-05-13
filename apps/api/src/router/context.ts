import { db } from '@/db/client';
import { createActor } from 'xstate';
import { backendState } from '@/systems';

export const sharedActor = createActor(backendState, {
  input: { model: 'gpt-4o' }
}).start();

export const createContext = () => ({
  db,
  actor: sharedActor
});

export type Context = ReturnType<typeof createContext>;
