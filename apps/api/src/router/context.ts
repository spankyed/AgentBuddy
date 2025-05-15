import { db } from '@/db/client';
import { createActor } from 'xstate';
import { backendSystem } from '@/systems';
import { logErrors } from '@/shared/actor-helpers';

export const backendActor = createActor(backendSystem, {
  input: { model: 'gpt-4o' }
}).start();

backendActor.subscribe(logErrors('Backend'));

export const createContext = () => ({
  db,
  actor: backendActor
});

export type Context = ReturnType<typeof createContext>;
