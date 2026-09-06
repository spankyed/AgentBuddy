import { inject } from 'vue'

export function useApplicationActor(): any {
  return inject('applicationActor')!
}
