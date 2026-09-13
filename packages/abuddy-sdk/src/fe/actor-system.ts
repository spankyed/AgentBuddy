import { inject } from 'vue'
import type { AnyActorRef } from 'xstate'

/** The renderer's actor system: the application, plugin and host actors by id */
export interface PluginActorSystem {
  get(id: string): AnyActorRef
}

export function useActorSystem(): PluginActorSystem {
  return inject<PluginActorSystem>('actorSystem')!
}

export function useApplicationActor(): AnyActorRef {
  return inject<AnyActorRef>('applicationActor')!
}
