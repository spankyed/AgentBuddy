import type { ActorSystem, ActorRefFromLogic, EventFromLogic, AnyActorRef } from 'xstate';
import type actorStates from '@/actors';
import type { Simplify } from './type-helpers';

type ActorStates = typeof actorStates;
type ActorIds = keyof ActorStates;

export function getActor<Id extends ActorIds>(
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  system: ActorSystem<any>,
  id: Id,
) {
  type ActorRef = ActorRefFromLogic<ActorStates[Id]>;
  type ActorEvents = EventFromLogic<ActorStates[Id]>;
  
  return system.get(id) as ActorRef;
}
