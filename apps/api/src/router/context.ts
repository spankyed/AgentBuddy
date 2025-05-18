import { db } from '@/db/client';
import { createActor } from 'xstate';
import { backendSystem, bus } from '@/systems';
import { logErrors } from '@/shared/actor-helpers';
// import { createSkyInspector } from '@statelyai/inspect';

// const sky = createSkyInspector();

export const backendActor = createActor(backendSystem, {
  // inspect: sky.inspect,
  systemId: bus,
  input: { model: 'gpt-4o' }
}).start();

backendActor.subscribe(logErrors('Backend'));

export const createContext = () => ({
  db,
  actor: backendActor
});

export type Context = ReturnType<typeof createContext>;
