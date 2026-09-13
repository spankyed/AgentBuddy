import { inject } from 'vue'

export function useActorSystem(): { get(id: string): any } {
  return inject<{ get(id: string): any }>('actorSystem')!
}

export function useApplicationActor(): any {
  return inject('applicationActor')!
}
