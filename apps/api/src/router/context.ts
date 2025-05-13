import { db } from '@/db/client';
import { createActor } from 'xstate';
import { backendSystem } from '@/systems';
import { logErrors } from '@/shared/actor-helpers';

const actor = createActor(backendSystem, {
  input: { model: 'gpt-4o' }
}).start();

actor.subscribe(logErrors('Backend'));

export const createContext = () => ({
  db,
  actor
});

export type Context = ReturnType<typeof createContext>;
