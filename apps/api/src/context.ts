import { db } from './db/client';
import { createActor } from 'xstate';
import { agentMachine } from './agents/agentMachine';

type ActorMap = Map<string, ReturnType<typeof createActor>>;

export const createContext = () => {
  const actors: ActorMap = new Map();

  return {
    db,
    getAgent(sessionId: string, model: string) {
      if (!actors.has(sessionId)) {
        const actor = createActor(agentMachine, {
          input: { sessionId, model }
        }).start();
        actors.set(sessionId, actor);
      }
      return actors.get(sessionId)!;
    },
  };
};

export type Context = ReturnType<typeof createContext>;